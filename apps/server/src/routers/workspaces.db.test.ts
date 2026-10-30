// @vitest-environment node
/**
 * Integration tests for workspaces.create and summary against a real Postgres. Opt-in
 * like plan-items.db.test.ts: runs only when TEST_DATABASE_URL points at a
 * migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test workspaces.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('workspaces.create (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
  })

  afterAll(async () => {
    if (!db) return
    // workspace_scopes cascade with their workspace.
    await db.sql.unsafe('DELETE FROM workspaces WHERE user_id = ANY($1)', [[alice, bob]])
    await db.sql.end()
  })

  it('creates a board with no course and no scope', async () => {
    const api = caller(alice)
    const ws = await api.workspaces.create({ name: 'Plain board' })
    expect(ws).toMatchObject({ name: 'Plain board' })
    expect(await api.workspaces.scopes(ws.id as string)).toEqual([])
  })

  it('stores an optional course as the board course scope', async () => {
    const api = caller(alice)
    const ws = await api.workspaces.create({ name: 'Biology week', courseTag: 'biology' })
    const scopes = await api.workspaces.scopes(ws.id as string)
    expect(scopes).toEqual([expect.objectContaining({ scope_type: 'tag', scope_value: 'biology' })])
  })

  it('summary lists each board with its widget types, in tab order, and only the caller\'s boards', async () => {
    const api = caller(bob)
    const plan = await api.workspaces.create({ name: 'Plan' })
    const lecture = await api.workspaces.create({ name: 'In Lecture' })
    const empty = await api.workspaces.create({ name: 'Empty' })
    for (const [ws, lensType] of [[plan, 'calendar'], [plan, 'todo'], [lecture, 'transcript'], [lecture, 'audio-capture']] as const) {
      await api.workspaces.addPanel({ workspaceId: ws.id as string, lensType, slotName: lensType })
    }
    await api.workspaces.reorder([lecture.id as string, plan.id as string, empty.id as string])
    expect(await api.workspaces.summary()).toEqual([
      { id: lecture.id, name: 'In Lecture', sort_order: 0, lens_types: ['transcript', 'audio-capture'] },
      { id: plan.id, name: 'Plan', sort_order: 1, lens_types: ['calendar', 'todo'] },
      { id: empty.id, name: 'Empty', sort_order: 2, lens_types: [] },
    ])
    // Alice sees none of Bob's boards.
    const alices = await caller(alice).workspaces.summary()
    expect(alices.map((w) => w.id)).not.toContain(plan.id)
    expect(alices.map((w) => w.id)).toEqual((await caller(alice).workspaces.list()).map((w) => w.id))
  })
})
