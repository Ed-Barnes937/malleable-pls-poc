// @vitest-environment node
/**
 * Integration tests for the preferences router (study hours, study time per
 * day, time zone) against a real Postgres. Opt-in like plan-items.db.test.ts:
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_s1a pnpm test preferences.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { DEFAULT_STUDY_HOURS, type StudyHours } from '@pls/substrate'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

const weekdays: StudyHours = { ...DEFAULT_STUDY_HOURS, mon: { start: '10:00', end: '24:00' }, sun: null }

describe.skipIf(!TEST_DATABASE_URL)('preferences router (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  const carol = `test-carol-${randomUUID().slice(0, 8)}`

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
    await db.sql`DELETE FROM user_preferences WHERE user_id = ANY(${[alice, bob, carol]})`
    await db.sql.end()
  })

  it('returns the defaults when nothing is set', async () => {
    expect(await caller(carol).preferences.get()).toEqual({
      time_zone: null,
      study_hours: DEFAULT_STUDY_HOURS,
      study_min_per_day: 120,
    })
  })

  it('updates only the fields given, and null puts one back to its default', async () => {
    const api = caller(alice)
    expect(await api.preferences.update({ study_min_per_day: 90 })).toEqual({
      time_zone: null,
      study_hours: DEFAULT_STUDY_HOURS,
      study_min_per_day: 90,
    })
    await api.preferences.update({ study_hours: weekdays, time_zone: 'Europe/Paris' })
    expect(await api.preferences.get()).toEqual({ time_zone: 'Europe/Paris', study_hours: weekdays, study_min_per_day: 90 })

    // An empty patch changes nothing.
    expect(await api.preferences.update({})).toEqual({ time_zone: 'Europe/Paris', study_hours: weekdays, study_min_per_day: 90 })

    await api.preferences.update({ study_min_per_day: null, time_zone: null })
    expect(await api.preferences.get()).toEqual({ time_zone: null, study_hours: weekdays, study_min_per_day: 120 })
    const [row] = await db.sql`SELECT study_min_per_day, time_zone FROM user_preferences WHERE user_id = ${alice}`
    expect(row).toEqual({ study_min_per_day: null, time_zone: null })
  })

  it('rejects malformed study hours, budgets and zones', async () => {
    const api = caller(bob)
    const bad: unknown[] = [
      { study_hours: { ...weekdays, tue: { start: '9:00', end: '22:00' } } },
      { study_hours: { ...weekdays, tue: { start: '24:00', end: '22:00' } } },
      { study_hours: { ...weekdays, tue: { start: '10:00', end: '10:00' } } },
      { study_hours: { ...weekdays, tue: { start: '10:00', end: '24:30' } } },
      { study_hours: { mon: null } },
      { study_hours: { ...weekdays, funday: null } },
      { study_min_per_day: 10 },
      { study_min_per_day: 90.5 },
      { time_zone: 'Mars/Olympus' },
      { colour: 'red' },
    ]
    for (const input of bad) {
      await expect(api.preferences.update(input as never), JSON.stringify(input)).rejects.toThrow()
    }
    // No overnight windows for now: the end must be after the start.
    await expect(api.preferences.update({ study_hours: { ...weekdays, fri: { start: '20:00', end: '02:00' } } })).rejects.toThrow()
    expect((await api.preferences.get()).study_hours).toEqual(DEFAULT_STUDY_HOURS)
  })

  it('backs the input rules with CHECK constraints', async () => {
    const insert = (cols: Record<string, unknown>) =>
      db.withUser(carol, (tx) => tx`
        INSERT INTO user_preferences ${tx({ user_id: carol, ...cols } as unknown as Record<string, never>)}
        ON CONFLICT (user_id) DO UPDATE SET study_hours = EXCLUDED.study_hours, study_min_per_day = EXCLUDED.study_min_per_day
      `)
    await expect(insert({ study_min_per_day: 5 })).rejects.toThrow(/chk_user_preferences_study_min_per_day/)
    await expect(insert({ study_hours: db.sql.json({ mon: null }) })).rejects.toThrow(/chk_user_preferences_study_hours/)
    await expect(insert({ study_hours: db.sql.json({ ...weekdays, sun: { start: '9am', end: '22:00' } } as never) }))
      .rejects.toThrow(/chk_user_preferences_study_hours/)
    await expect(insert({ study_hours: db.sql.json({ ...weekdays, sun: { start: '09:00', end: '22:00', extra: 1 } } as never) }))
      .rejects.toThrow(/chk_user_preferences_study_hours/)
    await expect(insert({ study_hours: db.sql.json({ ...weekdays, sun: { start: '20:00', end: '02:00' } } as never) }))
      .rejects.toThrow(/chk_user_preferences_study_hours/)
    await expect(insert({ study_hours: db.sql.json({ ...weekdays, sun: { start: '10:00', end: '10:00' } } as never) }))
      .rejects.toThrow(/chk_user_preferences_study_hours/)
    await insert({ study_hours: db.sql.json(weekdays as never) })
  })

  it('isolates users through RLS as the non-owner app role', async () => {
    await caller(alice).preferences.update({ study_min_per_day: 60 })

    const asApp = (userId: string, query: string, params: unknown[] = []) =>
      db.sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE pls_app')
        await tx`SELECT set_config('app.current_user_id', ${userId}, true)`
        return tx.unsafe(query, params as never[])
      })

    expect(await asApp(bob, 'SELECT user_id FROM user_preferences WHERE user_id = $1', [alice])).toHaveLength(0)
    expect(await asApp(alice, 'SELECT user_id FROM user_preferences WHERE user_id = $1', [alice])).toHaveLength(1)
    expect(await asApp(bob, 'UPDATE user_preferences SET study_min_per_day = 360 WHERE user_id = $1 RETURNING user_id', [alice])).toHaveLength(0)
    expect(await asApp(bob, 'DELETE FROM user_preferences WHERE user_id = $1 RETURNING user_id', [alice])).toHaveLength(0)
    await expect(asApp(bob, 'INSERT INTO user_preferences (user_id, study_min_per_day) VALUES ($1, 360)', [carol + '-x']))
      .rejects.toThrow(/row-level security/)

    // Through the router: bob's settings are his own.
    expect((await caller(bob).preferences.get()).study_min_per_day).not.toBe(60)
    expect((await caller(alice).preferences.get()).study_min_per_day).toBe(60)
  })
})
