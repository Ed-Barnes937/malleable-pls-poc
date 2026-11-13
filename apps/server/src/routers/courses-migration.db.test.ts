// @vitest-environment node
/**
 * The courses migration (NNN_courses.sql) against a real Postgres, opt-in
 * like the other db tests (TEST_DATABASE_URL).
 *
 * It runs DDL, so it never touches the shared test database: it clones the
 * run's pre-lectures template (pre-lectures-template.global-setup.ts),
 * migrates it up to just before this migration, adds several students' data
 * the way the app stored it (course keys as plain TEXT, stray values
 * included), runs the migration twice and drops the database.
 */
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { COURSE_COLORS } from '@pls/substrate'
import { LECTURES, MIGRATIONS, databaseUrl, readMigration as read } from '../test-support/pre-lectures-template.global-setup'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const COURSES = MIGRATIONS.find((f) => /^\d+_courses\.sql$/.test(f))!

describe.skipIf(!TEST_DATABASE_URL)('courses migration (own Postgres database)', () => {
  const dbName = `pls_migration_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  let admin: postgres.Sql
  let db: postgres.Sql
  const notices: string[] = []
  // Dana uses all three courses and some stray values; Eve has only a board
  // and a stray value that differs from a course name only in case; Finn
  // has only a tag; Gus has nothing but a provisioning row.
  const dana = 'test-dana'
  const eve = 'test-eve'
  const finn = 'test-finn'
  const gus = 'test-gus'

  // In the order they were made: each takes the next palette colour here.
  const coursesOf = async (userId: string) =>
    (await db`
      SELECT id, name, color, archived_at FROM courses WHERE user_id = ${userId}
      ORDER BY array_position(${[...COURSE_COLORS]}::text[], color)
    `).map((r) => [r.id, r.name, r.color, r.archived_at])
  let firstRun: unknown[] = []

  beforeAll(async () => {
    const template = inject('preLecturesTemplate')
    if (!template) throw new Error('No pre-lectures template: is the global setup in vitest.config.ts?')
    admin = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE DATABASE ${dbName} TEMPLATE ${template}`)
    db = postgres(databaseUrl(TEST_DATABASE_URL!, dbName), { max: 1, onnotice: (n) => notices.push(n.message) })
    for (const file of MIGRATIONS.filter((f) => f >= LECTURES && f < COURSES)) await db.unsafe(read(file))

    await db`INSERT INTO workspaces (id, user_id, name) VALUES ('ws-dana', ${dana}, 'Dana board'), ('ws-eve', ${eve}, 'Eve board')`
    await db`
      INSERT INTO lectures (id, user_id, title, course) VALUES
        ('lec-bio', ${dana}, 'Cells', 'biology'),
        ('lec-chem', ${dana}, 'Alkenes', 'chemistry'),
        ('lec-none', ${dana}, 'Unfiled', NULL),
        ('lec-latin', ${dana}, 'Verbs', 'latin')
    `
    await db`INSERT INTO resources (id, user_id, kind, title, url, course) VALUES ('res-phys', ${dana}, 'link', 'Waves', 'https://a.test', 'physics')`
    await db`
      INSERT INTO plan_items (id, user_id, kind, title, duration_min, course) VALUES
        ('todo-bio', ${dana}, 'task', 'Quiz prep', 30, 'biology'),
        ('todo-history', ${dana}, 'task', 'Essay', 30, 'History'),
        ('todo-eve', ${eve}, 'task', 'Read', 30, 'Biology')
    `
    await db`
      INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value) VALUES
        (${dana}, 'ws-dana', 'tag', 'geography'),
        (${eve}, 'ws-eve', 'tag', 'biology')
    `
    // Deleted a moment ago: its course is in its row (025) and beside it (024).
    await db`
      INSERT INTO plan_item_trash (id, user_id, row, course)
      VALUES ('todo-trashed', ${dana}, ${db.json({ id: 'todo-trashed', user_id: dana, kind: 'task', title: 'Old', status: 'open', course: 'music' })}, 'music')
    `
    await db`INSERT INTO tags (id, user_id, target_type, target_id, label) VALUES ('t-finn', ${finn}, 'transcript_segment', 'seg-1', 'confused')`
    await db`INSERT INTO user_provisioning (user_id) VALUES (${gus})`

    await db.unsafe(read(COURSES))
    firstRun = [...await db`SELECT * FROM courses ORDER BY user_id, id`]
    // Idempotent: a second run changes nothing.
    await db.unsafe(read(COURSES))
    for (const file of MIGRATIONS.filter((f) => f > COURSES)) await db.unsafe(read(file))
  })

  afterAll(async () => {
    await db?.end()
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await admin.end()
    }
  })

  it('gives every student with data Biology, Chemistry and Physics, keeping their ids, in today\'s colours', async () => {
    const starters = [
      ['biology', 'Biology', 'green', null],
      ['chemistry', 'Chemistry', 'blue', null],
      ['physics', 'Physics', 'purple', null],
    ]
    expect((await coursesOf(dana)).slice(0, 3)).toEqual(starters)
    expect((await coursesOf(eve)).slice(0, 3)).toEqual(starters)
    expect(await coursesOf(finn)).toEqual(starters)
  })

  it('makes every other value in use a course of its own, named after it in the next palette colour', async () => {
    expect((await coursesOf(dana)).slice(3)).toEqual([
      // Board scope, plan item, lecture, trashed plan item: by value.
      ['geography', 'Geography', 'amber', null],
      ['History', 'History', 'rose', null],
      ['latin', 'Latin', 'teal', null],
      ['music', 'Music', 'orange', null],
    ])
    // A name the student already has gets a number.
    expect((await coursesOf(eve)).slice(3)).toEqual([['Biology', 'Biology (2)', 'amber', null]])
    expect(notices.filter((n) => n.startsWith('courses migration'))).toEqual([
      'courses migration: 5 course value(s) in use were not Biology, Chemistry or Physics; each became a course of its own',
    ])
  })

  it('gives a student with no data no courses', async () => {
    expect(await coursesOf(gus)).toEqual([])
  })

  it('changes nothing when run again', async () => {
    expect(await db`SELECT * FROM courses ORDER BY user_id, id`).toEqual(firstRun)
  })

  it('rewrites no reference', async () => {
    expect((await db`SELECT id, course FROM lectures WHERE user_id = ${dana} ORDER BY id`).map((r) => [r.id, r.course])).toEqual([
      ['lec-bio', 'biology'], ['lec-chem', 'chemistry'], ['lec-latin', 'latin'], ['lec-none', null],
    ])
    expect((await db`SELECT id, course FROM plan_items ORDER BY id`).map((r) => [r.id, r.course])).toEqual([
      ['todo-bio', 'biology'], ['todo-eve', 'Biology'], ['todo-history', 'History'],
    ])
  })

  it('drops the trash course column; the row keeps the course', async () => {
    expect(await db`SELECT 1 FROM information_schema.columns WHERE table_name = 'plan_item_trash' AND column_name = 'course'`).toEqual([])
    expect((await db`SELECT row->>'course' AS course FROM plan_item_trash WHERE id = 'todo-trashed'`)[0].course).toBe('music')
  })

  it('adds the foreign keys last: an unknown or another student\'s course is refused, a course in use stays', async () => {
    const names = (await db`SELECT conname FROM pg_constraint WHERE conname LIKE 'fk_%_course' ORDER BY conname`).map((r) => r.conname)
    expect(names).toEqual(['fk_lectures_course', 'fk_plan_items_course', 'fk_resources_course'])
    await expect(db`INSERT INTO lectures (user_id, title, course) VALUES (${dana}, 'X', 'nope')`).rejects.toMatchObject({ code: '23503' })
    // Eve has a course with the id 'Biology'; Dana doesn't, whatever the id string.
    await expect(db`INSERT INTO plan_items (user_id, kind, title, duration_min, course) VALUES (${dana}, 'task', 'X', 30, 'Biology')`)
      .rejects.toMatchObject({ code: '23503' })
    await expect(db`INSERT INTO resources (user_id, kind, title, url, course) VALUES (${gus}, 'link', 'X', 'https://a.test', 'biology')`)
      .rejects.toMatchObject({ code: '23503' })
    await expect(db`DELETE FROM courses WHERE user_id = ${dana} AND id = 'physics'`).rejects.toMatchObject({ code: '23503' })
  })
})
