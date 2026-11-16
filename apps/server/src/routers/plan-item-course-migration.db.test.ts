// @vitest-environment node
/**
 * The plan-item course migration (NNN_plan_item_course.sql) against a real
 * Postgres, opt-in like the other db tests (TEST_DATABASE_URL).
 *
 * It runs DDL, so it never touches the shared test database: it clones the
 * run's pre-lectures template (pre-lectures-template.global-setup.ts),
 * migrates it up to just before this migration, adds plan items with their
 * course as 'plan_item' tags (the old way), runs the migration twice and
 * drops the database.
 */
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { LECTURES, MIGRATIONS, databaseUrl, readMigration as read } from '../test-support/pre-lectures-template.global-setup'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const PLAN_ITEM_COURSE = MIGRATIONS.find((f) => /^\d+_plan_item_course\.sql$/.test(f))!

describe.skipIf(!TEST_DATABASE_URL)('plan-item course migration (own Postgres database)', () => {
  const dbName = `pls_migration_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  let admin: postgres.Sql
  let db: postgres.Sql
  const notices: string[] = []
  const dana = 'test-dana'
  const eve = 'test-eve'

  async function planItem(id: string, userId = dana) {
    await db`INSERT INTO plan_items (id, user_id, kind, title, duration_min) VALUES (${id}, ${userId}, 'task', ${id}, 30)`
  }
  async function tag(id: string, targetId: string, label: string, createdAt: string, userId = dana) {
    await db`
      INSERT INTO tags (id, user_id, target_type, target_id, label, created_at)
      VALUES (${id}, ${userId}, 'plan_item', ${targetId}, ${label}, ${createdAt})
    `
  }
  const courses = async () =>
    (await db`SELECT id, course FROM plan_items WHERE user_id IN (${dana}, ${eve}) ORDER BY id`).map((r) => [r.id, r.course])

  beforeAll(async () => {
    const template = inject('preLecturesTemplate')
    if (!template) throw new Error('No pre-lectures template: is the global setup in vitest.config.ts?')
    admin = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE DATABASE ${dbName} TEMPLATE ${template}`)
    db = postgres(databaseUrl(TEST_DATABASE_URL!, dbName), { max: 1, onnotice: (n) => notices.push(n.message) })
    for (const file of MIGRATIONS.filter((f) => f >= LECTURES && f < PLAN_ITEM_COURSE)) await db.unsafe(read(file))

    await planItem('a-one-tag')
    await tag('t-1', 'a-one-tag', 'biology', '2026-10-01T10:00:00Z')
    // Several tags: the first by (created_at, id) is the one readers showed.
    await planItem('b-several')
    await tag('t-2', 'b-several', 'physics', '2026-10-02T10:00:00Z')
    await tag('t-3', 'b-several', 'chemistry', '2026-10-01T10:00:00Z')
    await planItem('c-tie')
    await tag('t-5', 'c-tie', 'biology', '2026-10-01T10:00:00Z')
    await tag('t-4', 'c-tie', 'physics', '2026-10-01T10:00:00Z')
    // A label that is no course key: nothing was validated, so it is kept.
    await planItem('d-unknown')
    await tag('t-6', 'd-unknown', 'History', '2026-10-01T10:00:00Z')
    // None of their own: another student's tag on it doesn't count.
    await planItem('e-none')
    await tag('t-7', 'e-none', 'physics', '2026-10-01T10:00:00Z', eve)
    await planItem('f-eve', eve)
    await tag('t-8', 'f-eve', 'chemistry', '2026-10-01T10:00:00Z', eve)
    // A tag on an item that is gone, and a tag that is not a plan item's.
    await tag('t-9', 'gone', 'biology', '2026-10-01T10:00:00Z')
    await db`INSERT INTO tags (id, user_id, target_type, target_id, label) VALUES ('t-seg', ${dana}, 'transcript_segment', 'seg-1', 'confused')`
    // Deleted a moment ago (024): its course was beside the row, not in it.
    await db`
      INSERT INTO plan_item_trash (id, user_id, row, course)
      VALUES ('g-trashed', ${dana}, ${db.json({ id: 'g-trashed', user_id: dana, kind: 'task', title: 'g-trashed', status: 'open' })}, 'physics')
    `

    await db.unsafe(read(PLAN_ITEM_COURSE))
    // Idempotent: a second run changes nothing.
    await db.unsafe(read(PLAN_ITEM_COURSE))
    for (const file of MIGRATIONS.filter((f) => f > PLAN_ITEM_COURSE)) await db.unsafe(read(file))
  })

  afterAll(async () => {
    await db?.end()
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await admin.end()
    }
  })

  it("moves each item's first course tag into its course column, unknown labels included", async () => {
    expect(await courses()).toEqual([
      ['a-one-tag', 'biology'],
      ['b-several', 'chemistry'],
      ['c-tie', 'physics'],
      ['d-unknown', 'History'],
      ['e-none', null],
      ['f-eve', 'chemistry'],
    ])
  })

  it('removes every plan item tag and leaves other tags alone', async () => {
    expect(await db`SELECT id FROM tags WHERE target_type = 'plan_item'`).toEqual([])
    expect((await db`SELECT id FROM tags WHERE id = 't-seg'`).map((r) => r.id)).toEqual(['t-seg'])
  })

  it('says how many extra course tags it dropped, once', async () => {
    expect(notices.filter((n) => n.includes('plan item course migration'))).toEqual([
      'plan item course migration: dropped 2 extra course tag(s) on plan items; each keeps its first as its course',
    ])
  })

  it('a plan item trashed before it comes back with its course', async () => {
    const [restored] = await db`SELECT (jsonb_populate_record(NULL::plan_items, row)).course FROM plan_item_trash WHERE id = 'g-trashed'`
    expect(restored.course).toBe('physics')
  })
})
