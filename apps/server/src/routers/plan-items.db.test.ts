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
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    // Same ctx shape as index.ts; vitest.setup.ts forces mock AI.
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
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
    // Board course goes through the shared helper, which only trusts the
    // caller's own course tags: bob tagging alice's to-do changes nothing.
    const untagged = all.find((r) => r.title === 'Read chapter 5')!
    await db.sql`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${bob}, 'plan_item', ${untagged.id}, 'biology')`
    expect((await api.planItems.list({ courseTag: 'biology' })).map((r) => r.title)).toEqual(['Biology lecture'])
    await db.sql`DELETE FROM tags WHERE user_id = ${bob}`

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
    await expect(api.planItems.delete(todo.id)).rejects.toThrow(/not found/)
    const [{ count }] = await db.sql`SELECT count(*)::int AS count FROM tags WHERE target_type = 'plan_item' AND target_id = ${todo.id}`
    expect(count).toBe(0)
  })

  it('editing from an occurrence row: a title-only patch leaves the series where it is', async () => {
    const api = caller(alice)
    const shift = await api.planItems.create({
      kind: 'commitment',
      title: 'Cafe shift',
      starts_at: '2026-10-22T16:00:00.000Z',
      ends_at: '2026-10-22T20:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
    })
    const range = { from: '2026-10-19T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z', kinds: ['commitment' as const] }
    const before = (await api.planItems.list(range)).filter((r) => r.id === shift.id)
    const second = before[1]
    expect(second).toMatchObject({ starts_at: '2026-10-29T17:00:00.000Z', series_starts_at: '2026-10-22T16:00:00.000Z' })

    await api.planItems.update({ id: second.id, patch: { title: 'Cafe shift (cover)' } })

    const after = (await api.planItems.list(range)).filter((r) => r.id === shift.id)
    expect(after.map((r) => [r.title, r.starts_at])).toEqual([
      ['Cafe shift (cover)', '2026-10-22T16:00:00.000Z'],
      ['Cafe shift (cover)', '2026-10-29T17:00:00.000Z'],
    ])

    // Moving one occurrence by +1h means shifting the series by the same delta.
    const hour = 60 * 60 * 1000
    await api.planItems.update({
      id: second.id,
      patch: {
        starts_at: new Date(Date.parse(second.series_starts_at!) + hour).toISOString(),
        ends_at: new Date(Date.parse(second.series_ends_at!) + hour).toISOString(),
      },
    })
    const moved = (await api.planItems.list(range)).filter((r) => r.id === shift.id)
    expect(moved.map((r) => r.starts_at)).toEqual(['2026-10-22T17:00:00.000Z', '2026-10-29T18:00:00.000Z'])
  })

  it('filters by scheduled and normalises offset timestamps to Z', async () => {
    const api = caller(alice)
    const placed = await api.planItems.create({
      kind: 'task', title: 'Placed', source_type: 'test-scheduled', starts_at: '2026-10-28T19:00:00+01:00', ends_at: '2026-10-28T19:20:00+01:00',
    })
    expect(placed.starts_at).toBe('2026-10-28T18:00:00.000Z')
    await api.planItems.create({ kind: 'task', title: 'Loose', source_type: 'test-scheduled' })

    const titles = async (scheduled: boolean) =>
      (await api.planItems.list({ sourceType: 'test-scheduled', scheduled })).map((r) => r.title)
    expect(await titles(true)).toEqual(['Placed'])
    expect(await titles(false)).toEqual(['Loose'])
  })

  it('rejects shapes that break the per-kind rules', async () => {
    const api = caller(alice)
    await expect(api.planItems.create({ kind: 'commitment', title: 'No time' })).rejects.toThrow(/commitment/)
    await expect(api.planItems.create({ kind: 'deadline', title: 'No due date' })).rejects.toThrow(/due_at/)

    const quiz = await api.planItems.create({ kind: 'deadline', title: 'Quiz', due_at: '2026-10-29T09:00:00.000Z' })
    await expect(api.planItems.update({ id: quiz.id, patch: { due_at: null } })).rejects.toThrow(/due_at/)
    await expect(api.planItems.update({ id: 'missing', patch: { title: 'x' } })).rejects.toThrow(/not found/)

    const span = { starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T10:00:00.000Z' }
    await expect(api.planItems.create({ kind: 'task', title: 'Weekly review', ...span, recurrence: { freq: 'weekly' } }))
      .rejects.toThrow(/only commitments/)
    await expect(api.planItems.create({
      kind: 'commitment', title: 'Ends early', ...span, recurrence: { freq: 'weekly', until: '2026-10-01T00:00:00.000Z' },
    })).rejects.toThrow(/until/)
    // The table enforces the commitment-only rule too.
    await expect(db.withUser(alice, (tx) => tx`
      INSERT INTO plan_items (user_id, kind, title, starts_at, ends_at, recurrence)
      VALUES (${alice}, 'task', 'x', ${span.starts_at}, ${span.ends_at}, ${tx.json({ freq: 'weekly' })})
    `)).rejects.toThrow(/chk_plan_items_recurrence/)
  })

  it('dispatches plan-item events by one rule: every change is updated, reaching done is completed once', async () => {
    const workflowFor = async (event: string) => {
      const [wf] = await db.withUser(alice, (tx) => tx`
        INSERT INTO workflows (user_id, source_lens, trigger_event, condition_field, condition_value)
        VALUES (${alice}, 'todo', ${event}, 'source_type', 'test-events')
        RETURNING id
      `)
      await db.withUser(alice, (tx) => tx`
        INSERT INTO workflow_jobs (user_id, workflow_id, job_type) VALUES (${alice}, ${wf.id}, 'test:noop')
      `)
      return wf.id as string
    }
    const created = await workflowFor('plan-item:created')
    const updated = await workflowFor('plan-item:updated')
    const completed = await workflowFor('plan-item:completed')
    const count = async (workflowId: string) => {
      const [{ n }] = await db.withUser(alice, (tx) => tx`SELECT count(*)::int AS n FROM job_runs WHERE workflow_id = ${workflowId}`)
      return n as number
    }

    const api = caller(alice)
    const a = await api.planItems.create({ kind: 'task', title: 'Via complete', source_type: 'test-events' })
    await api.planItems.complete(a.id)
    await api.planItems.complete(a.id) // already done: nothing fires

    const b = await api.planItems.create({ kind: 'task', title: 'Via update', source_type: 'test-events' })
    await api.planItems.update({ id: b.id, patch: { status: 'done' } })
    await api.planItems.update({ id: b.id, patch: { title: 'Still done' } }) // updated, not completed again

    const c = await api.planItems.create({ kind: 'task', title: 'Dismissed', source_type: 'test-events' })
    await api.planItems.dismiss(c.id)
    await api.planItems.dismiss(c.id) // no change: nothing fires

    expect(await count(created)).toBe(3)
    expect(await count(updated)).toBe(4) // complete a, update b x2, dismiss c
    expect(await count(completed)).toBe(2) // a and b, once each

    const [run] = await db.withUser(alice, (tx) => tx`SELECT input FROM job_runs WHERE workflow_id = ${completed} ORDER BY created_at LIMIT 1`)
    expect(run.input).toMatchObject({ id: a.id, kind: 'task', status: 'done' })
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
