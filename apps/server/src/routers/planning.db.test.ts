// @vitest-environment node
/**
 * Integration tests for Help me plan's Auto-fill (planning.autofill) against
 * a real Postgres, with the fake LLM. Opt-in like plan-items.db.test.ts:
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t9 pnpm test planning.db
 *
 * Uses a week next year so "now" never falls inside it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { draftPlan, planTasks, weekLayout } from '@pls/substrate'
import type { FakeLlmClient } from '../ai/fake-llm'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TZ = 'Europe/London'
// Mon 1 Nov 2027 (GMT, so local = UTC).
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2027, 10, 1 + day, h, m)).toISOString()
const week = { from: at(0, 0), to: at(7, 0), timeZone: TZ }

describe.skipIf(!TEST_DATABASE_URL)('planning.autofill (Postgres)', () => {
  let db: typeof import('@pls/db')
  let llm: FakeLlmClient
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createFakeLlmClient } = await import('../ai/fake-llm')
    const { createServerExecutors } = await import('../workflows/executors')
    llm = createFakeLlmClient()
    const ai = { ...createAiDeps(), llm }
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'tags', 'plan_items']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice, bob]])
    }
    await db.sql.end()
  })

  it('ranks the unscheduled to-dos, suggests a trim when over capacity, and writes nothing', async () => {
    const api = caller(alice)
    // A full week: only Monday and Tuesday mornings are free (2h budget each).
    for (let d = 0; d < 7; d++) {
      await api.planItems.create({ kind: 'commitment', title: `Busy ${d}`, starts_at: at(d, d < 2 ? 12 : 8), ends_at: at(d, 22) })
    }
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report write-up', duration_min: 240, due_at: at(4, 17), course: 'chemistry' })
    const quiz = await api.planItems.create({ kind: 'task', title: 'Biology quiz prep', duration_min: 60, due_at: at(3, 9), course: 'biology' })
    const review = await api.planItems.create({ kind: 'task', title: 'Review: maternal inheritance', duration_min: 30, due_at: at(3, 9), subtype: 'review' })
    const cards = await api.planItems.create({ kind: 'task', title: 'Flashcards' })
    // Already scheduled, and other users' to-dos, are not part of the plan.
    await api.planItems.create({ kind: 'task', title: 'Scheduled', duration_min: 30, starts_at: at(0, 8), ends_at: at(0, 8, 30) })
    await caller(bob).planItems.create({ kind: 'task', title: 'Bob to-do', duration_min: 30 })

    const before = await api.planItems.list()
    const advice = await api.planning.autofill({ ...week, estimates: { [cards.id]: 60 } })

    // Soonest due first, the weak topic (a review) before the quiz due at the same time.
    expect(advice.order).toEqual([review.id, quiz.id, lab.id, cards.id])
    expect(advice.trims).toEqual([expect.objectContaining({ taskId: lab.id, durationMin: 120 })])
    expect(advice.note).toMatch(/Review: maternal inheritance is due soonest/)
    expect(await api.planItems.list()).toEqual(before)

    const call = llm.calls.at(-1)!
    expect(call.task).toBe('plan-autofill')
    expect(call.prompt).toContain('"Review: maternal inheritance"')
    expect(call.prompt).toContain('[weak topic]')
    expect(call.prompt).toContain('30 min')
    expect(call.prompt).not.toContain('Bob to-do')
    expect(call.prompt).not.toContain('Scheduled')
    // 3h30m of study time left (2h Mon minus the 30m block, 2h Tue); 6h30m needed.
    expect(call.input).toMatchObject({ freeMin: 210, neededMin: 390, minutesPerDay: 120 })
  })

  it('returns empty advice without calling the model when nothing needs planning', async () => {
    const calls = llm.calls.length
    expect(await caller(bob).planning.autofill({ from: at(14, 0), to: at(21, 0), timeZone: TZ }))
      .toMatchObject({ trims: [], note: expect.anything() })
    // Bob has one to-do, so the model runs; a user with none does not.
    const nobody = `test-nobody-${randomUUID().slice(0, 8)}`
    expect(await caller(nobody).planning.autofill({ ...week })).toEqual({ order: [], trims: [], note: null })
    expect(llm.calls.length).toBe(calls + 1)
  })

  it("reads study hours and study time per day from the student's preference", async () => {
    const pat = `test-pat-${randomUUID().slice(0, 8)}`
    const api = caller(pat)
    try {
      await api.planItems.create({ kind: 'task', title: 'Essay plan', duration_min: 120 })
      // Study only Monday 09:00-10:00 and Thursday 18:00-20:00, at most 45 minutes a day.
      const none = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }
      await api.preferences.update({
        study_hours: { ...none, mon: { start: '09:00', end: '10:00' }, thu: { start: '18:00', end: '20:00' } },
        study_min_per_day: 45,
      })
      await api.planning.autofill(week)
      // 45m on each of the two days with study hours; nothing on the others.
      expect(llm.calls.at(-1)!.input).toMatchObject({ freeMin: 90, neededMin: 120, minutesPerDay: 45 })
    } finally {
      await db.sql`DELETE FROM user_preferences WHERE user_id = ${pat}`
      await db.sql`DELETE FROM plan_items WHERE user_id = ${pat}`
    }
  })

  it('rejects a range longer than a week', async () => {
    await expect(caller(alice).planning.autofill({ from: at(0, 0), to: at(14, 0), timeZone: TZ })).rejects.toThrow()
  })

  it('accepting a drafted block makes it fixed: a later review is placed around it', async () => {
    const api = caller(alice)
    const todos = await api.planItems.list({ kinds: ['task'], statuses: ['open'], scheduled: false })
    const rows = await api.planItems.list({ from: week.from, to: week.to, statuses: ['open', 'done'] })
    const layout = weekLayout(rows, { start: Date.parse(week.from), end: Date.parse(week.to) }, { timeZone: TZ })
    const now = Date.parse(week.from)
    const [first] = draftPlan(planTasks(todos.filter((t) => t.duration_min), layout.week, { now }), layout, { now }).placements
    // Accept: the same write the Calendar makes.
    await api.planItems.update({
      id: first.taskId,
      patch: { starts_at: new Date(first.start).toISOString(), ends_at: new Date(first.end).toISOString() },
    })

    const { findReviewSlots } = await import('../planning/review-automation')
    const slots = await db.withUser(alice, (tx) =>
      findReviewSlots(tx, alice, [{ id: 'new-review', durationMin: 20, markedAt: now, latest: Date.parse(at(2, 0)) }], { now, timeZone: TZ }))
    const slot = slots.get('new-review') as { start: number; end: number }
    expect(slot.end <= first.start || slot.start >= first.end).toBe(true)
  })
})
