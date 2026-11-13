// @vitest-environment node
/**
 * Deleting a board while a course change refiles it, against a real
 * Postgres. Opt-in like lectures.db.test.ts: runs only when
 * TEST_DATABASE_URL points at a migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test board-delete.db
 *
 * A file of its own because its connections plan without index scans: the
 * delete cascades to the board's scope rows in whatever order the planner's
 * scan meets them, which on a small or freshly vacuumed table is a heap scan
 * (the order the rows lie in) and on another an index (lecture row first).
 * This pins the heap scan, so the test meets the order that deadlocked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { lockProbes } from '../test-support/locks'
import { insertStarterCourses } from '../test-support/courses'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('workspaces.delete during a course change (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  let locks: ReturnType<typeof lockProbes>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const api = () => caller(alice)
  const board = async () => (await api().workspaces.create({ name: `Board ${randomUUID().slice(0, 4)}` })).id as string
  const storedScope = async (workspaceId: string) =>
    (await db.sql`SELECT scope_type, scope_value FROM workspace_scopes WHERE workspace_id = ${workspaceId} ORDER BY scope_type`)
      .map((r) => [r.scope_type, r.scope_value])

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL!)
    url.searchParams.set('enable_indexscan', 'off')
    url.searchParams.set('enable_bitmapscan', 'off')
    process.env.DATABASE_URL = url.toString()
    db = await import('@pls/db')
    await insertStarterCourses(db.sql, alice)
    locks = lockProbes(db.sql)
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
  })

  afterAll(async () => {
    if (!db) return
    // Scopes cascade with their board.
    await db.sql`DELETE FROM workspaces WHERE user_id = ${alice}`
    await db.sql`DELETE FROM lectures WHERE user_id = ${alice}`
    await db.sql.end()
  })

  it('deleting a board while a course change refiles it does not deadlock, though its course row lies first', async () => {
    const moving = await api().lectures.create({ course: 'physics', title: 'Moving, board deleted' })
    const [first, second] = await locks.inLockOrder([await board(), await board()])
    // Both show the lecture, the course row stored before the lecture row,
    // as scope writes stored them before the lecture row came first.
    for (const ws of [first, second]) {
      await db.sql`
        INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value)
        VALUES (${alice}, ${ws}, 'tag', 'physics'), (${alice}, ${ws}, 'lecture', ${moving.id})
      `
    }
    // The cascade's scan meets the course row first.
    const plan = await db.sql`EXPLAIN DELETE FROM ONLY workspace_scopes WHERE workspace_id = ${first}`
    expect(plan.map((r) => r['QUERY PLAN']).join('\n')).toContain('Seq Scan on workspace_scopes')
    const heapOrder = await db.sql`SELECT scope_type FROM workspace_scopes WHERE workspace_id = ${first} ORDER BY ctid`
    expect(heapOrder.map((r) => r.scope_type)).toEqual(['tag', 'lecture'])

    // The course change has locked the first board's lecture row and waits for the second's.
    const holder = await locks.holdLectureRow(second)
    try {
      const update = api().lectures.update({ id: moving.id, course: 'chemistry' })
      await expect.poll(async () => (await locks.waiting(holder.pid)).on_it).toBe(1)

      // The first board is deleted, and waits for the change at its lecture row.
      const { outcome: deletion } = await locks.settledOrBehind(holder.pid, () => api().workspaces.delete(first))
      await holder.release()
      await Promise.all([update, deletion])
    } finally {
      await holder.release()
    }

    expect((await api().workspaces.list()).map((w) => w.id)).not.toContain(first)
    expect(await storedScope(first)).toEqual([])
    expect(await storedScope(second)).toEqual([['lecture', moving.id], ['tag', 'chemistry']])
  })
})
