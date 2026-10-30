// @vitest-environment node
/**
 * The class-link backfill (NNN_link_lectures_to_classes.sql) and the CHECK
 * change before it, against a real Postgres, opt-in like the other db tests
 * (TEST_DATABASE_URL).
 *
 * Migrations run DDL, so this never touches the shared test database: it
 * creates a throwaway database on the same server, migrates it up to just
 * before the backfill, adds lectures and classes of its own, runs the
 * backfill twice and drops the database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { occurrenceOn, type PlanItem } from '@pls/substrate'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const MIGRATIONS_DIR = resolve(__dirname, '../../../../packages/db/src/migrations')
const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const BACKFILL = MIGRATIONS.find((f) => /^\d+_link_lectures_to_classes\.sql$/.test(f))!
const read = (file: string) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8')

describe.skipIf(!TEST_DATABASE_URL)('lecture class-link backfill (own Postgres database)', () => {
  const dbName = `pls_migration_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  let admin: postgres.Sql
  let db: postgres.Sql
  const dana = 'test-dana'
  const eli = 'test-eli'
  const weeklyLondon = { freq: 'weekly', timeZone: 'Europe/London' }

  async function planItem(id: string, userId: string, course: string | null, fields: {
    subtype?: string; starts_at: string; ends_at: string; recurrence?: object
  }) {
    await db`
      INSERT INTO plan_items (id, user_id, kind, title, starts_at, ends_at, subtype, recurrence)
      VALUES (${id}, ${userId}, 'commitment', ${id}, ${fields.starts_at}, ${fields.ends_at}, ${fields.subtype ?? 'class'},
              ${fields.recurrence ? db.json(fields.recurrence as postgres.JSONValue) : null})
    `
    if (course) {
      await db`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${userId}, 'plan_item', ${id}, ${course})`
    }
  }
  async function lecture(id: string, userId: string, course: string | null, startsAt: string, link?: [string, string]) {
    await db`
      INSERT INTO lectures (id, user_id, title, course, starts_at, class_item_id, class_date)
      VALUES (${id}, ${userId}, ${id}, ${course}, ${startsAt}, ${link?.[0] ?? null}, ${link?.[1] ?? null})
    `
  }
  const links = async () =>
    (await db`SELECT id, class_item_id, class_date::text AS class_date FROM lectures WHERE user_id IN (${dana}, ${eli}) ORDER BY id`)
      .map((l) => [l.id, l.class_item_id, l.class_date])

  beforeAll(async () => {
    admin = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE DATABASE ${dbName}`)
    const url = new URL(TEST_DATABASE_URL!)
    url.pathname = `/${dbName}`
    db = postgres(url.toString(), { max: 1, onnotice: () => {} })
    for (const file of MIGRATIONS.filter((f) => f < BACKFILL)) await db.unsafe(read(file))

    // Biology: Mondays 10:00-12:00 London from Mon 19 Oct 2026 (BST; GMT from 26 Oct).
    await planItem('bio', dana, 'biology', { starts_at: '2026-10-19T09:00:00Z', ends_at: '2026-10-19T11:00:00Z', recurrence: weeklyLondon })
    // Two Chemistry classes on Tuesdays: a lecture that day is ambiguous.
    await planItem('chem-a', dana, 'chemistry', { starts_at: '2026-10-20T09:00:00Z', ends_at: '2026-10-20T10:00:00Z', recurrence: weeklyLondon })
    await planItem('chem-b', dana, 'chemistry', { subtype: 'lab', starts_at: '2026-10-20T13:00:00Z', ends_at: '2026-10-20T15:00:00Z', recurrence: weeklyLondon })
    // Physics until Fri 30 Oct only.
    await planItem('phys', dana, 'physics', { starts_at: '2026-10-23T09:00:00Z', ends_at: '2026-10-23T10:00:00Z', recurrence: { ...weeklyLondon, until: '2026-10-30T23:00:00Z' } })
    // A shift with a course would be a class block; with none it never is.
    await planItem('shift', dana, null, { subtype: 'shift', starts_at: '2026-10-19T17:00:00Z', ends_at: '2026-10-19T21:00:00Z', recurrence: weeklyLondon })

    await lecture('dana-1-linked', dana, 'biology', '2026-10-26T10:30:00Z')
    await lecture('dana-2-evening', dana, 'biology', '2026-10-19T19:00:00Z')
    await lecture('dana-3-ambiguous', dana, 'chemistry', '2026-10-27T09:30:00Z')
    await lecture('dana-4-pair-a', dana, 'biology', '2026-11-02T10:00:00Z')
    await lecture('dana-4-pair-b', dana, 'biology', '2026-11-02T11:00:00Z')
    await lecture('dana-5-already', dana, 'biology', '2026-11-09T10:00:00Z', ['bio', '2026-11-09'])
    await lecture('dana-5-taken', dana, 'biology', '2026-11-09T10:30:00Z')
    await lecture('dana-6-unfiled', dana, null, '2026-11-16T10:30:00Z')
    await lecture('dana-7-tuesday', dana, 'biology', '2026-11-17T10:30:00Z')
    await lecture('dana-8-physics-in', dana, 'physics', '2026-10-30T09:30:00Z')
    await lecture('dana-8-physics-after', dana, 'physics', '2026-11-06T09:30:00Z')
    await lecture('dana-9-before-series', dana, 'biology', '2026-10-12T10:00:00Z')

    // Eli is in New York and has a one-off physics class on Wed 21 Oct, 16:00
    // there; his lecture at 22:00 New York is 22 Oct in London and UTC.
    await db`INSERT INTO user_preferences (user_id, time_zone) VALUES (${eli}, 'America/New_York')`
    await planItem('eli-phys', eli, 'physics', { starts_at: '2026-10-21T20:00:00Z', ends_at: '2026-10-21T21:00:00Z' })
    await lecture('eli-1', eli, 'physics', '2026-10-22T02:00:00Z')

    await db.unsafe(read(BACKFILL))
    // Idempotent: a second run changes nothing.
    await db.unsafe(read(BACKFILL))
    for (const file of MIGRATIONS.filter((f) => f > BACKFILL)) await db.unsafe(read(file))
  })

  afterAll(async () => {
    await db?.end()
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await admin.end()
    }
  })

  it('links only where exactly one class occurrence of the course is on the lecture day, and nobody else claims it', async () => {
    expect(await links()).toEqual([
      // Across the clocks going back, any time of the class's day.
      ['dana-1-linked', 'bio', '2026-10-26'],
      ['dana-2-evening', 'bio', '2026-10-19'],
      // Two Chemistry classes that day.
      ['dana-3-ambiguous', null, null],
      // Two lectures for one occurrence.
      ['dana-4-pair-a', null, null],
      ['dana-4-pair-b', null, null],
      ['dana-5-already', 'bio', '2026-11-09'],
      // The occurrence already has its lecture.
      ['dana-5-taken', null, null],
      ['dana-6-unfiled', null, null],
      // No Biology class on Tuesdays.
      ['dana-7-tuesday', null, null],
      ['dana-8-physics-after', null, null],
      ['dana-8-physics-in', 'phys', '2026-10-30'],
      ['dana-9-before-series', null, null],
      // The student's zone dates a one-off class.
      ['eli-1', 'eli-phys', '2026-10-21'],
    ])
  })

  it('agrees with the shared occurrence rules the app uses', async () => {
    const items = await db`
      SELECT p.*, (SELECT label FROM tags t WHERE t.target_id = p.id LIMIT 1) AS course FROM plan_items p
      WHERE p.user_id IN (${dana}, ${eli})
    `
    const byId = new Map(items.map((p) => [p.id as string, {
      ...p,
      starts_at: (p.starts_at as Date).toISOString(),
      ends_at: (p.ends_at as Date).toISOString(),
    } as unknown as PlanItem]))
    for (const [, classItemId, date] of await links()) {
      if (!classItemId) continue
      const zone = classItemId === 'eli-phys' ? 'America/New_York' : 'Europe/London'
      expect(occurrenceOn(byId.get(classItemId)!, date, zone), `${classItemId} on ${date}`).not.toBeNull()
    }
  })

  it("keeps each class the zone 020 dated its lectures in, so they stay linked whatever zone asks later", async () => {
    const zones = await db`SELECT id, time_zone FROM plan_items WHERE user_id IN (${dana}, ${eli}) ORDER BY id`
    expect(zones.map((z) => [z.id, z.time_zone])).toEqual([
      ['bio', 'Europe/London'], ['chem-a', 'Europe/London'], ['chem-b', 'Europe/London'],
      ['eli-phys', 'America/New_York'], ['phys', 'Europe/London'], ['shift', 'Europe/London'],
    ])
    const [eliClass] = await db`SELECT p.*, 'physics' AS course FROM plan_items p WHERE id = 'eli-phys'`
    const item = { ...eliClass, starts_at: (eliClass.starts_at as Date).toISOString(), ends_at: (eliClass.ends_at as Date).toISOString() } as unknown as PlanItem
    // Eli now asks from Tokyo (or London): still Wed 21 Oct, his lecture's day.
    for (const zone of ['Asia/Tokyo', 'Europe/London', 'America/New_York']) {
      expect(occurrenceOn(item, '2026-10-21', zone), zone).not.toBeNull()
    }
  })

  it('deleting a class keeps its lectures, on their day', async () => {
    await db`DELETE FROM plan_items WHERE id = 'phys'`
    const [row] = await db`SELECT class_item_id, class_date::text AS class_date FROM lectures WHERE id = 'dana-8-physics-in'`
    expect(row).toEqual({ class_item_id: null, class_date: '2026-10-30' })
    // A link still needs its date.
    await expect(db`UPDATE lectures SET class_item_id = 'bio', class_date = NULL WHERE id = 'dana-7-tuesday'`).rejects.toThrow(/chk_lectures_class/)
  })
})
