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

  /** As the Calendar does: reads before the Accept, accepts, reads after. */
  async function accept(api: ReturnType<typeof student>['api'], ids: string[], write: () => Promise<unknown>) {
    const before = await api.planItems.undoState(ids)
    await write()
    const after = await api.planItems.undoState(ids)
    return before.map((b, i) => ({ before: b, after: after[i] }))
  }

  it('revert undoes an accepted draft in one go: times, estimates and the sessions it booked', async () => {
    const { api } = student()
    const essay = await api.planItems.create({ kind: 'task', title: 'Essay plan', duration_min: 90 })
    // A to-do already booked in its own block: a second booking moves that block into a session.
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report', duration_min: 180 })
    await api.planItems.update({ id: lab.id, patch: { starts_at: at(2, 9), ends_at: at(2, 10) } })
    const items = await accept(api, [essay.id, lab.id], async () => {
      // Auto-fill gave the essay its own block, shrinking the estimate to fit.
      await api.planItems.update({ id: essay.id, patch: { starts_at: at(1, 9), ends_at: at(1, 10), duration_min: 60 } })
      await api.planItems.create(newSession(lab, at(3, 9), at(3, 11)))
    })
    expect(await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).toHaveLength(2)

    const { kept } = await api.planItems.revert({ items })
    expect(kept).toEqual([])
    expect(await api.planItems.byId(essay.id)).toMatchObject({ starts_at: null, ends_at: null, duration_min: 90 })
    expect(await api.planItems.byId(lab.id)).toMatchObject({ starts_at: at(2, 9), ends_at: at(2, 10), duration_min: 180 })
    expect(await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).toEqual([])
  })

  it('revert keeps the sessions from before, and writes nothing when one item fails', async () => {
    const { api } = student()
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report', duration_min: 180 })
    const kept = await api.planItems.create(newSession(lab, at(3, 9), at(3, 11)))
    const items = await accept(api, [lab.id], () => api.planItems.create(newSession(lab, at(4, 9), at(4, 10))))
    const missing = { ...items[0].after, id: 'no-such-item' }
    await expect(api.planItems.revert({ items: [...items, { before: missing, after: missing }] })).rejects.toThrow(/not found/)
    expect(await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).toHaveLength(2)

    await api.planItems.revert({ items })
    expect((await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).map((s) => s.id)).toEqual([kept.id])
  })

  it('a stale Undo leaves an item the student changed since: moved, resized, a new estimate', async () => {
    const { api } = student()
    const moved = await api.planItems.create({ kind: 'task', title: 'Moved after', duration_min: 60 })
    const estimated = await api.planItems.create({ kind: 'task', title: 'New estimate', duration_min: 60 })
    const untouched = await api.planItems.create({ kind: 'task', title: 'Untouched', duration_min: 60 })
    const items = await accept(api, [moved.id, estimated.id, untouched.id], async () => {
      await api.planItems.update({ id: moved.id, patch: { starts_at: at(1, 9), ends_at: at(1, 10) } })
      await api.planItems.update({ id: estimated.id, patch: { starts_at: at(1, 11), ends_at: at(1, 12) } })
      await api.planItems.update({ id: untouched.id, patch: { starts_at: at(1, 13), ends_at: at(1, 14) } })
    })
    // Then the student drags one and changes the other's estimate.
    await api.planItems.update({ id: moved.id, patch: { starts_at: at(2, 9), ends_at: at(2, 10) } })
    await api.planItems.update({ id: estimated.id, patch: { duration_min: 45 } })

    const { reverted, kept } = await api.planItems.revert({ items })
    expect(kept).toEqual([{ id: moved.id, title: 'Moved after' }, { id: estimated.id, title: 'New estimate' }])
    expect(reverted.map((r) => r.id)).toEqual([untouched.id])
    expect(await api.planItems.byId(moved.id)).toMatchObject({ starts_at: at(2, 9), ends_at: at(2, 10) })
    expect(await api.planItems.byId(estimated.id)).toMatchObject({ starts_at: at(1, 11), duration_min: 45 })
    expect(await api.planItems.byId(untouched.id)).toMatchObject({ starts_at: null, ends_at: null })
  })

  it('a stale Undo never deletes a session ticked since', async () => {
    const { api } = student()
    const lab = await api.planItems.create({ kind: 'task', title: 'Lab report', duration_min: 120 })
    let first = ''
    const items = await accept(api, [lab.id], async () => {
      await api.planItems.update({ id: lab.id, patch: { duration_min: 90 } })
      first = (await api.planItems.create(newSession(lab, at(1, 9), at(1, 10)))).id
      await api.planItems.create(newSession(lab, at(2, 9), at(2, 9, 30)))
    })
    await api.planItems.complete(first)

    const { kept } = await api.planItems.revert({ items })
    expect(kept).toEqual([{ id: lab.id, title: 'Lab report' }])
    expect(await api.planItems.list({ sourceType: 'plan_item', sourceId: lab.id })).toHaveLength(2)
    expect(await api.planItems.byId(lab.id)).toMatchObject({ duration_min: 90 })
  })

  it('revert of a re-fit move puts the block back, unless it was moved again', async () => {
    const { api } = student()
    const block = await api.planItems.create({ kind: 'task', title: 'Missed notes', starts_at: past(0, 9), ends_at: past(0, 10) })
    const again = await api.planItems.create({ kind: 'task', title: 'Moved again', starts_at: past(0, 11), ends_at: past(0, 12) })
    const items = await accept(api, [block.id, again.id], async () => {
      await api.planItems.update({ id: block.id, patch: { starts_at: at(1, 9), ends_at: at(1, 10) } })
      await api.planItems.update({ id: again.id, patch: { starts_at: at(1, 11), ends_at: at(1, 12) } })
    })
    await api.planItems.update({ id: again.id, patch: { starts_at: at(3, 11), ends_at: at(3, 12) } })

    const { kept } = await api.planItems.revert({ items })
    expect(kept.map((k) => k.id)).toEqual([again.id])
    expect(await api.planItems.byId(block.id)).toMatchObject({ starts_at: past(0, 9), ends_at: past(0, 10) })
    expect(await api.planItems.byId(again.id)).toMatchObject({ starts_at: at(3, 11) })
  })

  it('trash older than a day is not restored, and is purged by a restore', async () => {
    const { user, api } = student()
    const old = await api.planItems.create({ kind: 'task', title: 'Long gone' })
    const fresh = await api.planItems.create({ kind: 'task', title: 'Just deleted' })
    await api.planItems.delete(old.id)
    await api.planItems.delete(fresh.id)
    // The app role can't see other students' trash, so this runs as the owner.
    await db.sql`UPDATE plan_item_trash SET deleted_at = now() - interval '25 hours' WHERE id = ${old.id}`

    await expect(api.planItems.restore(old.id)).rejects.toThrow(/Nothing to restore/)
    expect(await db.sql`SELECT id FROM plan_item_trash WHERE user_id = ${user}`).toEqual([{ id: fresh.id }])
    expect(await api.planItems.restore(fresh.id)).toMatchObject({ id: fresh.id, title: 'Just deleted' })
  })
})
