// @vitest-environment node
/**
 * Sessions of a to-do (study blocks linked to it, see @pls/substrate
 * sessions) against a real Postgres. Opt-in like planning.db.test.ts:
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_fa1a pnpm test sessions.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { newSession, type PlanItem } from '@pls/substrate'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TZ = 'Europe/London'
// A week next year (GMT), so its sessions are still ahead.
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2027, 10, 1 + day, h, m)).toISOString()
const week = { from: at(0, 0), to: at(7, 0), timeZone: TZ }
const past = (day: number, h: number) => new Date(Date.UTC(2020, 0, 6 + day, h)).toISOString()

describe.skipIf(!TEST_DATABASE_URL)('to-do sessions (Postgres)', () => {
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
    for (const table of ['job_runs', 'tags', 'plan_items']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [users])
    }
    await db.sql.end()
  })

  /** A fresh student with a 3h lab report and sessions at the given times. */
  async function labWithSessions(times: [string, string][]) {
    const user = `test-sessions-${randomUUID().slice(0, 8)}`
    users.push(user)
    const api = caller(user)
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report write-up', duration_min: 180, due_at: at(4, 17), course: 'chemistry' })
    const sessions: PlanItem[] = []
    for (const [start, end] of times) sessions.push(await api.planItems.create(newSession(lab, start, end)))
    const list = async () => api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })
    return { api, lab, sessions, list }
  }

  it('stores a session as a study block linked to its to-do, which keeps its total', async () => {
    const { api, lab, sessions } = await labWithSessions([[at(3, 9), at(3, 11)]])
    expect(sessions[0]).toMatchObject({ kind: 'task', source_type: 'plan_item', source_id: lab.id, duration_min: 120, course: 'chemistry', due_at: lab.due_at })
    expect((await api.planItems.byId(lab.id))!).toMatchObject({ starts_at: null, duration_min: 180 })
  })

  it('Auto-fill plans what is not booked yet, and nothing once it is all booked', async () => {
    const { api, lab } = await labWithSessions([[at(3, 9), at(3, 11)]])
    expect((await api.planning.autofill(week)).order).toEqual([lab.id])
    await api.planItems.create(newSession(lab, at(4, 9), at(4, 10)))
    expect((await api.planning.autofill(week)).order).toEqual([])
  })

  it('ticking the to-do off ticks its sessions; reopening it reopens only those it closed', async () => {
    const { api, lab, sessions, list } = await labWithSessions([[at(3, 9), at(3, 11)], [at(4, 9), at(4, 10)]])
    // The student ticks the first session on its own.
    await api.planItems.complete({ id: sessions[0].id })
    await api.planItems.complete({ id: lab.id })
    expect((await list()).map((s) => s.status)).toEqual(['done', 'done'])
    await api.planItems.update({ id: lab.id, patch: { status: 'open' } })
    expect((await list()).map((s) => s.status)).toEqual(['done', 'open'])
  })

  it('dismissing the to-do dismisses its open sessions, and bringing it back brings them back', async () => {
    const { api, lab, list } = await labWithSessions([[at(3, 9), at(3, 11)], [at(4, 9), at(4, 10)]])
    await api.planItems.dismiss({ id: lab.id })
    expect((await list()).map((s) => s.status)).toEqual(['dismissed', 'dismissed'])
    await api.planItems.update({ id: lab.id, patch: { status: 'open' } })
    expect((await list()).map((s) => s.status)).toEqual(['open', 'open'])
  })

  it('reopening the to-do leaves a past session closed, so it never comes back as "didn\'t happen"', async () => {
    const { api, lab, list } = await labWithSessions([[past(0, 9), past(0, 11)], [at(4, 9), at(4, 10)]])
    await api.planItems.complete({ id: lab.id })
    await api.planItems.update({ id: lab.id, patch: { status: 'open' } })
    expect((await list()).map((s) => [s.starts_at, s.status])).toEqual([[past(0, 9), 'done'], [at(4, 9), 'open']])
  })

  it("a new title, course and due time carry over to the to-do's sessions", async () => {
    const { api, lab, list } = await labWithSessions([[at(3, 9), at(3, 11)]])
    await api.planItems.update({ id: lab.id, patch: { title: 'Lab report', course: 'biology', due_at: at(5, 12) } })
    expect((await list()).map((s) => [s.title, s.course, s.due_at])).toEqual([['Lab report', 'biology', at(5, 12)]])
  })

  it('deleting a session leaves the to-do alone; deleting the to-do deletes its sessions', async () => {
    const { api, lab, sessions } = await labWithSessions([[at(3, 9), at(3, 11)], [at(4, 9), at(4, 10)]])
    await api.planItems.delete(sessions[0].id)
    expect((await api.planItems.byId(lab.id))!).toMatchObject({ duration_min: 180, status: 'open' })
    await api.planItems.delete(lab.id)
    expect(await api.planItems.byId(sessions[1].id)).toBeNull()
  })

  it("a to-do booked in one block keeps its total when the block is resized, and Auto-fill plans the rest", async () => {
    const { api, lab } = await labWithSessions([])
    await api.planItems.update({ id: lab.id, patch: { starts_at: at(3, 9), ends_at: at(3, 10) } })
    expect((await api.planItems.byId(lab.id))!).toMatchObject({ duration_min: 180 })
    expect((await api.planning.autofill(week)).order).toEqual([lab.id])
  })

  it('a second booking moves the to-do\'s own block into a session, so each can be ticked on its own', async () => {
    const { api, lab, list } = await labWithSessions([])
    await api.planItems.update({ id: lab.id, patch: { starts_at: at(3, 9), ends_at: at(3, 10) } })
    const rest = await api.planItems.create(newSession(lab, at(4, 9), at(4, 11)))
    expect((await api.planItems.byId(lab.id))!).toMatchObject({ starts_at: null, ends_at: null, duration_min: 180, status: 'open' })
    expect((await list()).map((s) => [s.starts_at, s.ends_at, s.duration_min, s.course])).toEqual([
      [at(3, 9), at(3, 10), 60, 'chemistry'],
      [at(4, 9), at(4, 11), 120, 'chemistry'],
    ])
    await api.planItems.complete({ id: rest.id })
    expect((await api.planItems.byId(lab.id))!.status).toBe('open')
    expect((await api.planning.autofill(week)).order).toEqual([])
  })

  it('lengthening a booking past the estimate raises the estimate to the booked total; shortening never lowers it', async () => {
    const { api, lab } = await labWithSessions([])
    await api.planItems.update({ id: lab.id, patch: { starts_at: at(3, 9), ends_at: at(3, 13) } })
    expect((await api.planItems.byId(lab.id))!.duration_min).toBe(240)
    await api.planItems.update({ id: lab.id, patch: { starts_at: at(3, 9), ends_at: at(3, 10) } })
    expect((await api.planItems.byId(lab.id))!.duration_min).toBe(240)
  })

  it("lengthening a session raises its to-do's estimate to the sum of its sessions", async () => {
    const { api, lab, sessions } = await labWithSessions([[at(3, 9), at(3, 11)], [at(4, 9), at(4, 10)]])
    expect((await api.planItems.byId(lab.id))!.duration_min).toBe(180)
    await api.planItems.update({ id: sessions[1].id, patch: { starts_at: at(4, 9), ends_at: at(4, 11, 30) } })
    expect((await api.planItems.byId(lab.id))!.duration_min).toBe(270)
    // Moving it (same length) or shortening it leaves the estimate alone.
    await api.planItems.update({ id: sessions[1].id, patch: { starts_at: at(4, 12), ends_at: at(4, 13) } })
    expect((await api.planItems.byId(lab.id))!.duration_min).toBe(270)
  })

  it('study time made on the calendar has no estimate, and a resize never gives it one', async () => {
    const user = `test-sessions-${randomUUID().slice(0, 8)}`
    users.push(user)
    const api = caller(user)
    const block = await api.planItems.create({ kind: 'task', title: 'Revise', starts_at: at(3, 9), ends_at: at(3, 10), duration_min: null })
    await api.planItems.update({ id: block.id, patch: { starts_at: at(3, 9), ends_at: at(3, 9, 30) } })
    await api.planItems.update({ id: block.id, patch: { starts_at: at(3, 9), ends_at: at(3, 11) } })
    expect((await api.planItems.byId(block.id))!.duration_min).toBeNull()
    expect((await api.planning.autofill(week)).order).toEqual([])
  })

  it('bookSessions saves every session in one go, or none: a bad block leaves nothing behind', async () => {
    const { api, lab, list } = await labWithSessions([])
    await api.planItems.update({ id: lab.id, patch: { starts_at: at(3, 9), ends_at: at(3, 10) } })
    // The second block ends before it starts: nothing is saved, and the own block stays.
    await expect(api.planItems.bookSessions({ todoId: lab.id, blocks: [{ starts_at: at(4, 9), ends_at: at(4, 10) }, { starts_at: at(5, 10), ends_at: at(5, 9) }] }))
      .rejects.toThrow()
    expect(await list()).toEqual([])
    expect((await api.planItems.byId(lab.id))!).toMatchObject({ starts_at: at(3, 9), ends_at: at(3, 10) })

    const made = await api.planItems.bookSessions({ todoId: lab.id, blocks: [{ starts_at: at(4, 9), ends_at: at(4, 10) }, { starts_at: at(5, 9), ends_at: at(5, 10) }] })
    expect(made).toHaveLength(2)
    expect((await list()).map((s) => s.starts_at)).toEqual([at(3, 9), at(4, 9), at(5, 9)])
    expect((await api.planItems.byId(lab.id))!).toMatchObject({ starts_at: null, duration_min: 180 })
  })

  it('a session for a to-do that does not exist is NOT_FOUND, by create and by bookSessions', async () => {
    const { api, lab } = await labWithSessions([])
    await expect(api.planItems.create(newSession({ ...lab, id: 'missing-to-do' }, at(4, 9), at(4, 10)))).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(api.planItems.bookSessions({ todoId: 'missing-to-do', blocks: [{ starts_at: at(4, 9), ends_at: at(4, 10) }] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('bookSessions refuses a block longer than a day, an empty one, and blocks that overlap', async () => {
    const { api, lab, list } = await labWithSessions([])
    const book = (blocks: { starts_at: string; ends_at: string }[]) => api.planItems.bookSessions({ todoId: lab.id, blocks })
    await expect(book([{ starts_at: at(3, 9), ends_at: new Date(Date.UTC(2028, 10, 4, 9)).toISOString() }])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(book([{ starts_at: at(3, 9), ends_at: at(4, 9, 1) }])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(book([{ starts_at: at(3, 9), ends_at: at(3, 9) }])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(book([{ starts_at: at(3, 9), ends_at: at(3, 11) }, { starts_at: at(3, 10), ends_at: at(3, 12) }])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(await list()).toEqual([])
    expect((await api.planItems.byId(lab.id))!.duration_min).toBe(180)
    // Back to back is fine, and a full day is the most.
    expect(await book([{ starts_at: at(3, 9), ends_at: at(3, 10) }, { starts_at: at(3, 10), ends_at: at(3, 11) }])).toHaveLength(2)
  })

  it('bookSessions books only an open to-do of your own: not a review, a session, or one that is done', async () => {
    const { api, lab, sessions } = await labWithSessions([[at(3, 9), at(3, 10)]])
    const block = [{ starts_at: at(4, 9), ends_at: at(4, 10) }]
    const { api: reviewer, review } = await reviewBlock()
    await expect(reviewer.planItems.bookSessions({ todoId: review.id, blocks: block })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await reviewer.planItems.complete({ id: review.id })
    await expect(reviewer.planItems.bookSessions({ todoId: review.id, blocks: block })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(api.planItems.bookSessions({ todoId: sessions[0].id, blocks: block })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await api.planItems.complete({ id: lab.id })
    await expect(api.planItems.bookSessions({ todoId: lab.id, blocks: block })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect((await reviewer.planItems.byId(review.id))!).toMatchObject({ starts_at: at(3, 9), source_type: 'recording' })
  })

  /** A fresh student with a 30m review of a lecture moment, booked Thu 09:00-09:30. */
  async function reviewBlock() {
    const user = `test-sessions-${randomUUID().slice(0, 8)}`
    users.push(user)
    const api = caller(user)
    const review = await api.planItems.create({
      kind: 'task', title: 'Review: maternal inheritance', subtype: 'review', duration_min: 30, course: 'biology',
      starts_at: at(3, 9), ends_at: at(3, 9, 30), source_type: 'recording', source_id: 'rec-1', source_offset_ms: 540000,
    })
    return { api, review }
  }

  it('a review block shortened to 15m is not partly booked: its block is its booking', async () => {
    const { api, review } = await reviewBlock()
    await api.planItems.update({ id: review.id, patch: { starts_at: at(3, 9), ends_at: at(3, 9, 15) } })
    expect((await api.planning.autofill(week)).order).toEqual([])
  })

  it('a session aimed at a review never takes its block or its moment', async () => {
    const { api, review } = await reviewBlock()
    await api.planItems.create(newSession(review, at(4, 9), at(4, 9, 15)))
    expect((await api.planItems.byId(review.id))!).toMatchObject({ starts_at: at(3, 9), ends_at: at(3, 9, 30), source_type: 'recording', source_id: 'rec-1' })
  })
})
