// @vitest-environment node
/**
 * Integration tests against a real Postgres, opt-in like
 * workspaces.db.test.ts: runs only when TEST_DATABASE_URL points at a
 * migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test board-ownership.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/**
 * Writes that name a board. Postgres checks foreign keys without row-level
 * security, so each one checks the board is the caller's own: a board that
 * is gone or belongs to someone else is NOT_FOUND, never a raw 500, and
 * nothing is written to it.
 */
describe.skipIf(!TEST_DATABASE_URL)('writes to a board that is not yours (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  let aliceBoard: string

  const notFound = expect.objectContaining({ code: 'NOT_FOUND' })
  /** Alice's board as only the database sees it, past row-level security. */
  const aliceBoardRows = async (table: 'workspace_panels' | 'workspace_scopes' | 'workflows') =>
    db.sql.unsafe(`SELECT * FROM ${table} WHERE workspace_id = $1`, [aliceBoard])

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
    aliceBoard = (await caller(alice).workspaces.create({ name: 'Alice board', courseTag: 'biology' })).id as string
  })

  afterAll(async () => {
    if (!db) return
    // Panels and scopes cascade with their board.
    await db.sql.unsafe('DELETE FROM workflows WHERE user_id = ANY($1)', [[alice, bob]])
    await db.sql.unsafe('DELETE FROM workspaces WHERE user_id = ANY($1)', [[alice, bob]])
    await db.sql.end()
  })

  it("adding a panel to another student's board is NOT_FOUND and adds nothing", async () => {
    const add = caller(bob).workspaces.addPanel({ workspaceId: aliceBoard, lensType: 'calendar', slotName: 'slot-bob' })
    await expect(add).rejects.toBeInstanceOf(TRPCError)
    await expect(add).rejects.toEqual(notFound)
    expect(await aliceBoardRows('workspace_panels')).toEqual([])
  })

  it("setting another student's board scope is NOT_FOUND and leaves theirs alone", async () => {
    await expect(
      caller(bob).workspaces.setScope({ workspaceId: aliceBoard, scopeType: 'recording', scopeValue: 'rec-bob' }),
    ).rejects.toEqual(notFound)
    expect(await aliceBoardRows('workspace_scopes')).toEqual([
      expect.objectContaining({ user_id: alice, scope_type: 'tag', scope_value: 'biology' }),
    ])
  })

  it("changing another student's board background is NOT_FOUND", async () => {
    await expect(
      caller(bob).workspaces.updateBackground({ workspaceId: aliceBoard, backgroundType: 'solid', backgroundValue: '#000' }),
    ).rejects.toEqual(notFound)
    const [board] = await db.sql.unsafe('SELECT background_type FROM workspaces WHERE id = $1', [aliceBoard])
    expect(board.background_type).not.toBe('solid')
  })

  it("an automation on another student's board is NOT_FOUND and creates nothing", async () => {
    await expect(
      caller(bob).workflows.create({ workspaceId: aliceBoard, sourceLens: 'transcript', triggerEvent: 'tag:created', jobs: [] }),
    ).rejects.toEqual(notFound)
    const source = await caller(bob).workflows.create({ workspaceId: null, sourceLens: 'transcript', triggerEvent: 'tag:created', jobs: [] })
    await expect(
      caller(bob).workflows.createOverride({ sourceWorkflowId: source.id as string, workspaceId: aliceBoard, enabled: false }),
    ).rejects.toEqual(notFound)
    expect(await aliceBoardRows('workflows')).toEqual([])
  })

  it('a board that has been deleted is NOT_FOUND, not a foreign-key error', async () => {
    const api = caller(alice)
    const gone = (await api.workspaces.create({ name: 'Short-lived' })).id as string
    await api.workspaces.delete(gone)
    await expect(api.workspaces.addPanel({ workspaceId: gone, lensType: 'calendar', slotName: 'slot-gone' })).rejects.toEqual(notFound)
    await expect(api.workspaces.setScope({ workspaceId: gone, scopeType: 'tag', scopeValue: 'biology' })).rejects.toEqual(notFound)
  })

  it('the owner still adds panels to their own board', async () => {
    const panel = await caller(alice).workspaces.addPanel({ workspaceId: aliceBoard, lensType: 'calendar', slotName: 'slot-alice' })
    expect(panel).toMatchObject({ workspace_id: aliceBoard, user_id: alice, lens_type: 'calendar' })
  })
})
