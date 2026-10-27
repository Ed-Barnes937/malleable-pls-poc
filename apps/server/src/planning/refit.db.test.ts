// @vitest-environment node
/**
 * Re-fit against a real Postgres (opt-in, see routers/plan-items.db.test.ts):
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t10 pnpm test refit.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TZ = 'Europe/London'
const HOUR = 60 * 60_000

describe.skipIf(!TEST_DATABASE_URL)('planItems re-fit (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const users: string[] = []
  const newUser = () => {
    const id = `test-refit-${randomUUID().slice(0, 8)}`
    users.push(id)
    return id
  }
  const iso = (ms: number) => new Date(ms).toISOString()

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
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'tags', 'plan_items']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [users])
    }
    await db.sql.end()
  })

  it('previews only open, past to-do blocks, never commitments, around the whole week', async () => {
    const api = caller(newUser())
    const now = Date.now()
    const missed = await api.planItems.create({ kind: 'task', title: 'Read chapter 5', duration_min: 30, starts_at: iso(now - 26 * HOUR), ends_at: iso(now - 25.5 * HOUR) })
    await api.planItems.create({ kind: 'commitment', title: 'Shift', starts_at: iso(now - 4 * HOUR), ends_at: iso(now - 3 * HOUR) })
    const done = await api.planItems.create({ kind: 'task', title: 'Done already', starts_at: iso(now - 5 * HOUR), ends_at: iso(now - 4.5 * HOUR) })
    await api.planItems.complete(done.id)
    await api.planItems.create({ kind: 'task', title: 'Later today', starts_at: iso(now + 20 * HOUR), ends_at: iso(now + 21 * HOUR) })

    const preview = await api.planItems.refitPreview({ timeZone: TZ })
    expect(preview.map((p) => p.item.title)).toEqual(['Read chapter 5'])
    const [p] = preview
    expect(p.item.id).toBe(missed.id)
    expect(p.reason).toBeNull()
    expect(Date.parse(p.starts_at!)).toBeGreaterThanOrEqual(now)
    expect(Date.parse(p.ends_at!) - Date.parse(p.starts_at!)).toBe(30 * 60_000)
  })

  it('accepting moves the blocks as previewed, after which nothing is missed', async () => {
    const api = caller(newUser())
    const now = Date.now()
    await api.planItems.create({ kind: 'task', title: 'A', duration_min: 30, starts_at: iso(now - 50 * HOUR), ends_at: iso(now - 49.5 * HOUR) })
    await api.planItems.create({ kind: 'task', title: 'B', duration_min: 45, starts_at: iso(now - 26 * HOUR), ends_at: iso(now - 25 * HOUR) })
    const preview = await api.planItems.refitPreview({ timeZone: TZ })
    expect(preview).toHaveLength(2)

    const blocks = preview.map((p) => ({ id: p.item.id, starts_at: p.starts_at!, ends_at: p.ends_at! }))
    expect(await api.planItems.refit({ timeZone: TZ, blocks })).toEqual({ moved: 2 })

    const after = await api.planItems.list({ kinds: ['task'] })
    for (const b of blocks) {
      const item = after.find((i) => i.id === b.id)!
      expect([item.starts_at, item.ends_at]).toEqual([b.starts_at, b.ends_at])
    }
    expect(await api.planItems.refitPreview({ timeZone: TZ })).toEqual([])
  })

  it('refuses a stale preview: the slot is now taken, or the to-do is gone', async () => {
    const api = caller(newUser())
    const now = Date.now()
    const missed = await api.planItems.create({ kind: 'task', title: 'A', duration_min: 30, starts_at: iso(now - 26 * HOUR), ends_at: iso(now - 25.5 * HOUR) })
    const [p] = await api.planItems.refitPreview({ timeZone: TZ })
    const block = { id: missed.id, starts_at: p.starts_at!, ends_at: p.ends_at! }

    // A shift lands on the suggested slot.
    const shift = await api.planItems.create({ kind: 'commitment', title: 'Shift', starts_at: p.starts_at!, ends_at: p.ends_at! })
    await expect(api.planItems.refit({ timeZone: TZ, blocks: [block] })).rejects.toMatchObject({ code: 'CONFLICT' })
    await api.planItems.delete(shift.id)

    // Ticked off meanwhile.
    await api.planItems.complete(missed.id)
    await expect(api.planItems.refit({ timeZone: TZ, blocks: [block] })).rejects.toMatchObject({ code: 'CONFLICT' })
    const item = await api.planItems.byId(missed.id)
    expect(item?.starts_at).toBe(missed.starts_at)
  })
})
