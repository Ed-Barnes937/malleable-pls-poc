// @vitest-environment node
/**
 * Sessions of a to-do (study blocks linked to it, see @pls/substrate
 * sessions) against a real Postgres. Opt-in like planning.db.test.ts:
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_fa1a pnpm test sessions.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { newSession } from '@pls/substrate'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TZ = 'Europe/London'
// A week next year (GMT), so its sessions are all still ahead.
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2027, 10, 1 + day, h, m)).toISOString()
const week = { from: at(0, 0), to: at(7, 0), timeZone: TZ }

describe.skipIf(!TEST_DATABASE_URL)('to-do sessions (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`

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
    for (const table of ['job_runs', 'tags', 'plan_items']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice]])
    }
    await db.sql.end()
  })

  it('plans only what is not booked yet, and cascades tick, title, course and delete to the sessions', async () => {
    const api = caller(alice)
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report write-up', duration_min: 180, due_at: at(4, 17), course: 'chemistry' })
    const first = await api.planItems.create(newSession(lab, at(3, 9), at(3, 11)))
    expect(first).toMatchObject({ kind: 'task', source_type: 'plan_item', source_id: lab.id, duration_min: 120, course: 'chemistry', due_at: lab.due_at })

    // 1h of 3h left: Auto-fill still plans the to-do (ranked), the to-do keeps its total.
    expect((await api.planning.autofill(week)).order).toEqual([lab.id])
    expect((await api.planItems.byId(lab.id))!.duration_min).toBe(180)

    const second = await api.planItems.create(newSession(lab, at(4, 9), at(4, 10)))
    expect((await api.planning.autofill(week)).order).toEqual([])

    await api.planItems.update({ id: lab.id, patch: { title: 'Lab report', course: 'biology' } })
    await api.planItems.complete({ id: lab.id })
    let sessions = await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })
    expect(sessions.map((s) => [s.title, s.course, s.status])).toEqual([['Lab report', 'biology', 'done'], ['Lab report', 'biology', 'done']])

    await api.planItems.update({ id: lab.id, patch: { status: 'open' } })
    sessions = await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })
    expect(sessions.map((s) => s.status)).toEqual(['open', 'open'])

    await api.planItems.delete(lab.id)
    expect(await api.planItems.byId(first.id)).toBeNull()
    expect(await api.planItems.byId(second.id)).toBeNull()
  })
})
