// @vitest-environment node
/**
 * Undo of the student's big plan changes (flow audit 03) against a real
 * Postgres: delete then restore, dismiss then undismiss, accept then revert.
 * Opt-in like plan-items.db.test.ts:
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t03 pnpm test undo.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { newSession } from '@pls/substrate'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
// A week next year (GMT), so its blocks are still ahead.
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2027, 10, 1 + day, h, m)).toISOString()
const past = (day: number, h: number) => new Date(Date.UTC(2020, 0, 6 + day, h)).toISOString()

describe.skipIf(!TEST_DATABASE_URL)('Undo of plan changes (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const users: string[] = []

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
    for (const table of ['job_runs', 'tags', 'lectures', 'plan_items', 'plan_item_trash']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [users])
    }
    await db.sql.end()
  })

  function student() {
    const user = `test-undo-${randomUUID().slice(0, 8)}`
    users.push(user)
    return { user, api: caller(user) }
  }

  it('a deleted weekly class comes back exactly: same id, row, course and linked lectures', async () => {
    const { user, api } = student()
    const lecture = await api.planItems.create({
      kind: 'commitment', title: 'Biology lecture', subtype: 'class',
      starts_at: at(0, 9), ends_at: at(0, 10), recurrence: { freq: 'weekly', timeZone: 'Europe/London' }, course: 'biology',
    })
    const [linked] = await db.sql`
      INSERT INTO lectures (user_id, title, course, starts_at, class_item_id, class_date)
      VALUES (${user}, 'Biology lecture', 'biology', ${at(0, 9)}, ${lecture.id}, '2027-11-01')
      RETURNING id
    `
    await api.planItems.delete(lecture.id)
    expect(await api.planItems.byId(lecture.id)).toBeNull()
    const [unlinked] = await db.sql`SELECT class_item_id, class_date FROM lectures WHERE id = ${linked.id}`
    expect(unlinked.class_item_id).toBeNull()

    const restored = await api.planItems.restore(lecture.id)
    expect(restored).toEqual(lecture)
    const [relinked] = await db.sql`SELECT class_item_id FROM lectures WHERE id = ${linked.id}`
    expect(relinked.class_item_id).toBe(lecture.id)
    // Each week still shows it.
    const weeks = await api.planItems.list({ from: at(0, 0), to: at(14, 0) })
    expect(weeks.filter((r) => r.id === lecture.id)).toHaveLength(2)
    // Undo is one-shot: there is nothing left to put back.
    await expect(api.planItems.restore(lecture.id)).rejects.toThrow(/Nothing to restore/)
  })

  it("a deleted to-do comes back with its sessions, as they were", async () => {
    const { api } = student()
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report', duration_min: 180, course: 'chemistry' })
    const one = await api.planItems.create(newSession(lab, at(3, 9), at(3, 11)))
    const two = await api.planItems.create(newSession(lab, at(4, 9), at(4, 10)))
    await api.planItems.complete({ id: one.id })
    await api.planItems.delete(lab.id)
    expect(await api.planItems.byId(two.id)).toBeNull()

    await api.planItems.restore(lab.id)
    const sessions = await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })
    expect(sessions.map((s) => [s.id, s.status, s.course])).toEqual([[one.id, 'done', 'chemistry'], [two.id, 'open', 'chemistry']])
    expect(await api.planItems.byId(lab.id)).toMatchObject({ duration_min: 180, course: 'chemistry', status: 'open' })
  })

  it("another student can't restore what you deleted", async () => {
    const { api } = student()
    const { api: other } = student()
    const block = await api.planItems.create({ kind: 'task', title: 'Read chapter 5', starts_at: at(1, 9), ends_at: at(1, 10) })
    await api.planItems.delete(block.id)
    await expect(other.planItems.restore(block.id)).rejects.toThrow(/Nothing to restore/)
    expect(await api.planItems.restore(block.id)).toMatchObject({ id: block.id })
  })

  it('undismiss puts a removed to-do back with every session it closed, past ones too', async () => {
    const { api } = student()
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report', duration_min: 180 })
    const missed = await api.planItems.create(newSession(lab, past(0, 9), past(0, 11)))
    const ahead = await api.planItems.create(newSession(lab, at(4, 9), at(4, 10)))
    await api.planItems.dismiss({ id: lab.id })
    const item = await api.planItems.undismiss({ id: lab.id })
    expect(item.status).toBe('open')
    const sessions = await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })
    expect(sessions.map((s) => [s.id, s.status, s.subtype])).toEqual([[missed.id, 'open', null], [ahead.id, 'open', null]])
    // A to-do that isn't dismissed is left as it is.
    expect(await api.planItems.undismiss({ id: lab.id })).toMatchObject({ status: 'open' })
  })

  it('revert undoes an accepted draft in one go: times, estimates and the sessions it booked', async () => {
    const { api } = student()
    // A to-do Auto-fill gave its own block (shrinking the estimate to fit).
    const essay = await api.planItems.create({ kind: 'task', title: 'Essay plan', duration_min: 90 })
    await api.planItems.update({ id: essay.id, patch: { starts_at: at(1, 9), ends_at: at(1, 10), duration_min: 60 } })
    // A to-do already booked in its own block: a second booking moves that block into a session.
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report', duration_min: 180 })
    await api.planItems.update({ id: lab.id, patch: { starts_at: at(2, 9), ends_at: at(2, 10) } })
    const before = (await api.planItems.byId(lab.id))!
    await api.planItems.create(newSession(lab, at(3, 9), at(3, 11)))
    expect((await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id }))).toHaveLength(2)

    await api.planItems.revert({
      items: [
        { id: essay.id, starts_at: null, ends_at: null, duration_min: 90 },
        { id: lab.id, starts_at: before.starts_at, ends_at: before.ends_at, duration_min: before.duration_min, sessions: [] },
      ],
    })
    expect(await api.planItems.byId(essay.id)).toMatchObject({ starts_at: null, ends_at: null, duration_min: 90 })
    expect(await api.planItems.byId(lab.id)).toMatchObject({ starts_at: at(2, 9), ends_at: at(2, 10), duration_min: 180 })
    expect(await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).toEqual([])
  })

  it('revert keeps the sessions from before, and writes nothing when one item fails', async () => {
    const { api } = student()
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report', duration_min: 180 })
    const kept = await api.planItems.create(newSession(lab, at(3, 9), at(3, 11)))
    await api.planItems.create(newSession(lab, at(4, 9), at(4, 10)))
    await expect(api.planItems.revert({
      items: [
        { id: lab.id, starts_at: null, ends_at: null, duration_min: 180, sessions: [kept.id] },
        { id: 'no-such-item', starts_at: null, ends_at: null, duration_min: null },
      ],
    })).rejects.toThrow(/not found/)
    expect(await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).toHaveLength(2)

    await api.planItems.revert({ items: [{ id: lab.id, starts_at: null, ends_at: null, duration_min: 180, sessions: [kept.id] }] })
    expect((await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).map((s) => s.id)).toEqual([kept.id])
  })
})
