// @vitest-environment node
/**
 * The lectures migration (NNN_lectures.sql) against a real Postgres, opt-in
 * like the other db tests (TEST_DATABASE_URL).
 *
 * It runs DDL, so it never touches the shared test database other db test
 * files are using in parallel: it creates a throwaway database on the same
 * server, migrates it up to just before the lectures migration (which seeds
 * the demo data the old way), adds pre-lectures data of its own, runs the
 * lectures migration twice and drops the database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const MIGRATIONS_DIR = resolve(__dirname, '../../../../packages/db/src/migrations')
const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const LECTURES = MIGRATIONS.find((f) => /^\d+_lectures\.sql$/.test(f))!
const read = (file: string) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8')

describe.skipIf(!TEST_DATABASE_URL)('lectures migration (own Postgres database)', () => {
  const dbName = `pls_migration_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  let admin: postgres.Sql
  let db: postgres.Sql
  const notices: string[] = []
  const carol = 'test-carol'

  beforeAll(async () => {
    admin = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE DATABASE ${dbName}`)
    const url = new URL(TEST_DATABASE_URL!)
    url.pathname = `/${dbName}`
    db = postgres(url.toString(), { max: 1, onnotice: (n) => notices.push(n.message) })
    for (const file of MIGRATIONS.filter((f) => f < LECTURES)) await db.unsafe(read(file))

    // Data as it was before lectures: no lecture, course as a 'recording' tag.
    await db`
      INSERT INTO recordings (id, user_id, title, created_at) VALUES
        ('rec-a', ${carol}, 'Cells', '2026-04-01T10:00:00Z'),
        ('rec-b', ${carol}, 'Untagged', '2026-04-02T10:00:00Z'),
        ('rec-c', ${carol}, '', '2026-04-03T10:00:00Z')
    `
    await db`
      INSERT INTO tags (id, user_id, target_type, target_id, label, created_at) VALUES
        ('t-fav', ${carol}, 'recording', 'rec-a', 'favourite', '2026-04-01T09:00:00Z'),
        ('t-chem', ${carol}, 'recording', 'rec-a', 'chemistry', '2026-04-01T10:00:01Z'),
        ('t-bio', ${carol}, 'recording', 'rec-a', 'biology', '2026-04-01T10:00:02Z')
    `
    const board = async (id: string, scopes: [string, string][]) => {
      await db`INSERT INTO workspaces (id, user_id, name) VALUES (${id}, ${carol}, ${id})`
      for (const [i, [type, value]] of scopes.entries()) {
        await db`
          INSERT INTO workspace_scopes (id, user_id, workspace_id, scope_type, scope_value)
          VALUES (${`${id}-${i}`}, ${carol}, ${id}, ${type}, ${value})
        `
      }
    }
    // Breaks the strict rule: a Chemistry lecture on a Biology board.
    await board('ws-mismatch', [['tag', 'biology'], ['recording', 'rec-a']])
    // A lecture filed under no course on a Biology board: "All courses".
    await board('ws-unfiled', [['tag', 'biology'], ['recording', 'rec-b']])
    // Two focus rows that both become 'lecture' rows, and two course rows.
    await board('ws-duplicates', [['recording', 'rec-a'], ['recording', 'rec-b'], ['tag', 'physics'], ['tag', 'biology']])
    await board('ws-stale', [['recording', 'rec-deleted']])
    await board('ws-course-only', [['tag', 'physics']])

    await db.unsafe(read(LECTURES))
    // Idempotent: a second run changes nothing.
    await db.unsafe(read(LECTURES))
  })

  afterAll(async () => {
    await db?.end()
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await admin.end()
    }
  })

  const scopesOf = async (userId: string) =>
    (await db`SELECT workspace_id, scope_type, scope_value FROM workspace_scopes WHERE user_id = ${userId} ORDER BY workspace_id, scope_type`)
      .map((s) => [s.workspace_id, s.scope_type, s.scope_value])

  it('gives each recording a lecture with its first course tag as the course', async () => {
    const lectures = await db`SELECT id, title, course, starts_at FROM lectures WHERE user_id = ${carol} ORDER BY id`
    expect(lectures.map((l) => [l.id, l.title, l.course, (l.starts_at as Date).toISOString()])).toEqual([
      ['lec-rec-a', 'Cells', 'chemistry', '2026-04-01T10:00:00.000Z'],
      ['lec-rec-b', 'Untagged', null, '2026-04-02T10:00:00.000Z'],
      ['lec-rec-c', 'Untitled lecture', null, '2026-04-03T10:00:00.000Z'],
    ])
    const recordings = await db`SELECT id, lecture_id FROM recordings WHERE user_id = ${carol} ORDER BY id`
    expect(recordings.map((r) => [r.id, r.lecture_id])).toEqual([['rec-a', 'lec-rec-a'], ['rec-b', 'lec-rec-b'], ['rec-c', 'lec-rec-c']])
    const [{ is_nullable }] = await db`
      SELECT is_nullable FROM information_schema.columns WHERE table_name = 'recordings' AND column_name = 'lecture_id'
    `
    expect(is_nullable).toBe('NO')
  })

  it('drops the course tags on recordings, and says how many disagreed with the course it kept', async () => {
    const tags = await db`SELECT label FROM tags WHERE user_id = ${carol}`
    expect(tags.map((t) => t.label)).toEqual(['favourite'])
    // rec-a's 'biology' (its second course tag); only the first run drops any.
    expect(notices.filter((n) => n.includes('course tag'))).toEqual([expect.stringContaining('dropped 1 course tag')])
  })

  it('moves board focus to the lecture, one row per dimension, with the board course set from the lecture', async () => {
    expect(await scopesOf(carol)).toEqual([
      ['ws-course-only', 'tag', 'physics'],
      // Duplicates keep their lowest-id row (rec-a's focus, the physics
      // course), then the course follows the lecture.
      ['ws-duplicates', 'lecture', 'lec-rec-a'],
      ['ws-duplicates', 'tag', 'chemistry'],
      ['ws-mismatch', 'lecture', 'lec-rec-a'],
      ['ws-mismatch', 'tag', 'chemistry'],
      // rec-b's lecture is filed under no course: "All courses".
      ['ws-unfiled', 'lecture', 'lec-rec-b'],
    ])
  })

  it('fixes the demo boards: they open on the Biology lecture under Biology', async () => {
    expect(await scopesOf('dev-user-1')).toEqual([
      ['ws-evening-review', 'lecture', 'lec-rec-bio-4'],
      ['ws-evening-review', 'tag', 'biology'],
      ['ws-in-lecture', 'lecture', 'lec-rec-bio-4'],
      ['ws-in-lecture', 'tag', 'biology'],
    ])
    const [{ course }] = await db`SELECT course FROM lectures WHERE id = 'lec-rec-bio-4'`
    expect(course).toBe('biology')
  })

  it('refuses a second row of one dimension on a board from then on', async () => {
    await expect(db`
      INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value) VALUES (${carol}, 'ws-course-only', 'tag', 'biology')
    `).rejects.toThrow(/uq_workspace_scopes_dimension/)
  })
})
