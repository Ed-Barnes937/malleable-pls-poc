// @vitest-environment node
/**
 * Integration tests for the planItems router against a real Postgres.
 *
 * Opt-in: runs only when TEST_DATABASE_URL points at a migrated database (so a
 * plain `pnpm test` never touches anyone's dev data). Every test uses fresh
 * random user ids and deletes its rows afterwards. Example:
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t1 pnpm test plan-items.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('planItems router (Postgres)', () => {
  // Imported lazily so the pool is created with the test database URL.
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    caller = (userId) => appRouter.createCaller({ userId })
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'tags', 'plan_items']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice, bob]])
    }
    await db.sql.end()
  })

  it('creates, lists with weekly expansion, and filters by course, kind and status', async () => {
    const api = caller(alice)
    const lecture = await api.planItems.create({
      kind: 'commitment',
      title: 'Biology lecture',
      subtype: 'class',
      starts_at: '2026-10-19T09:00:00.000Z',
      ends_at: '2026-10-19T10:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
      course: 'biology',
    })
    expect(lecture).toMatchObject({ kind: 'commitment', course: 'biology', status: 'open', recurrence: { freq: 'weekly' } })

    await api.planItems.create({ kind: 'deadline', title: 'Chemistry lab report', due_at: '2026-10-30T17:00:00.000Z', course: 'chemistry' })
    await api.planItems.create({ kind: 'task', title: 'Read chapter 5', duration_min: 30 })

    // Two week views straddling the DST change: the lecture stays at 10:00 London time.
    const twoWeeks = await api.planItems.list({ from: '2026-10-19T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z' })
    expect(twoWeeks.map((r) => [r.title, r.starts_at ?? r.due_at])).toEqual([
      ['Biology lecture', '2026-10-19T09:00:00.000Z'],
      ['Biology lecture', '2026-10-26T10:00:00.000Z'],
      ['Chemistry lab report', '2026-10-30T17:00:00.000Z'],
    ])

    // A range a few months on still finds the series (SQL prefilter keeps open-ended recurrences).
    const later = await api.planItems.list({ from: '2027-01-04T00:00:00.000Z', to: '2027-01-11T00:00:00.000Z' })
    expect(later.map((r) => r.starts_at)).toEqual(['2027-01-04T10:00:00.000Z'])

    const all = await api.planItems.list()
    expect(all).toHaveLength(3)

    const bio = await api.planItems.list({ courseTag: 'biology' })
    expect(bio.map((r) => r.title)).toEqual(['Biology lecture'])

    const tasks = await api.planItems.list({ kinds: ['task'] })
    expect(tasks.map((r) => r.title)).toEqual(['Read chapter 5'])

    expect(await api.planItems.list({ statuses: ['done'] })).toEqual([])
  })

  it('updates fields, changes course, completes, dismisses and deletes', async () => {
    const api = caller(alice)
    const todo = await api.planItems.create({ kind: 'task', title: 'Review: maternal inheritance', duration_min: 20, course: 'biology' })

    const scheduled = await api.planItems.update({
      id: todo.id,
      patch: { starts_at: '2026-10-28T18:00:00.000Z', ends_at: '2026-10-28T18:20:00.000Z', course: 'chemistry' },
    })
    expect(scheduled).toMatchObject({ starts_at: '2026-10-28T18:00:00.000Z', course: 'chemistry', duration_min: 20 })

    const cleared = await api.planItems.update({ id: todo.id, patch: { course: null, duration_min: null } })
    expect(cleared).toMatchObject({ course: null, duration_min: null, title: 'Review: maternal inheritance' })

    expect((await api.planItems.complete(todo.id)).status).toBe('done')
    expect((await api.planItems.dismiss(todo.id)).status).toBe('dismissed')

    await api.planItems.delete(todo.id)
    expect(await api.planItems.byId(todo.id)).toBeNull()
    const [{ count }] = await db.sql`SELECT count(*)::int AS count FROM tags WHERE target_type = 'plan_item' AND target_id = ${todo.id}`
    expect(count).toBe(0)
  })

  it('rejects shapes that break the per-kind rules', async () => {
    const api = caller(alice)
    await expect(api.planItems.create({ kind: 'commitment', title: 'No time' })).rejects.toThrow(/commitment/)
    await expect(api.planItems.create({ kind: 'deadline', title: 'No due date' })).rejects.toThrow(/due_at/)

    const quiz = await api.planItems.create({ kind: 'deadline', title: 'Quiz', due_at: '2026-10-29T09:00:00.000Z' })
    await expect(api.planItems.update({ id: quiz.id, patch: { due_at: null } })).rejects.toThrow(/due_at/)
    await expect(api.planItems.update({ id: 'missing', patch: { title: 'x' } })).rejects.toThrow(/not found/)
  })

  it('dispatches plan-item workflow events', async () => {
    const [wf] = await db.withUser(alice, (tx) => tx`
      INSERT INTO workflows (user_id, source_lens, trigger_event, condition_field, condition_value)
      VALUES (${alice}, 'todo', 'plan-item:completed', 'kind', 'task')
      RETURNING id
    `)
    await db.withUser(alice, (tx) => tx`
      INSERT INTO workflow_jobs (user_id, workflow_id, job_type) VALUES (${alice}, ${wf.id}, 'schedule:quiz')
    `)

    const api = caller(alice)
    const todo = await api.planItems.create({ kind: 'task', title: 'Practice questions' })
    await api.planItems.complete(todo.id)
    await api.planItems.complete(todo.id) // already done: no second event

    const runs = await db.withUser(alice, (tx) => tx`SELECT input FROM job_runs WHERE workflow_id = ${wf.id}`)
    expect(runs).toHaveLength(1)
    expect(runs[0].input).toMatchObject({ id: todo.id, kind: 'task', status: 'done' })
  })

  it('isolates users through RLS as the non-owner app role', async () => {
    const mine = await caller(alice).planItems.create({ kind: 'task', title: 'Alice only', course: 'biology' })

    // The app filters by user_id itself; RLS is the backstop. Check it as
    // pls_app (the docker superuser bypasses RLS) with bob's session setting.
    const asApp = (userId: string, query: string, params: unknown[] = []) =>
      db.sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE pls_app')
        await tx`SELECT set_config('app.current_user_id', ${userId}, true)`
        return tx.unsafe(query, params as never[])
      })

    expect(await asApp(bob, 'SELECT id FROM plan_items WHERE id = $1', [mine.id])).toHaveLength(0)
    expect(await asApp(alice, 'SELECT id FROM plan_items WHERE id = $1', [mine.id])).toHaveLength(1)
    expect(await asApp(bob, `UPDATE plan_items SET title = 'hijack' WHERE id = $1 RETURNING id`, [mine.id])).toHaveLength(0)
    expect(await asApp(bob, 'DELETE FROM plan_items WHERE id = $1 RETURNING id', [mine.id])).toHaveLength(0)
    await expect(asApp(bob, `INSERT INTO plan_items (user_id, kind, title) VALUES ($1, 'task', 'spoof')`, [alice]))
      .rejects.toThrow(/row-level security/)

    // And through the router: bob neither sees nor can touch alice's item.
    expect(await caller(bob).planItems.list()).toEqual([])
    await expect(caller(bob).planItems.complete(mine.id)).rejects.toThrow(/not found/)
    expect((await caller(alice).planItems.byId(mine.id))?.title).toBe('Alice only')
  })
})
