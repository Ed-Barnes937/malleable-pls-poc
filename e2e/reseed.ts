// TODO: make playwright/backend-simulator/seed-data.ts the single source of
// truth for seed fixtures. Currently 002_seed.sql / 008_seed_panels.sql are
// maintained separately and have already drifted (panel pixel positions differ
// between the two). Unifying requires mapping TS field names to SQL columns and
// injecting user_id = 'dev-user-1' at insert time — low risk but non-trivial.

import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { resolve } from 'path'
import { resolveDatabaseUrl } from './db-url.mts'
import { validatePlanItem } from '../packages/substrate/src/plan-items'
import { STARTER_COURSES } from '../packages/substrate/src/courses'
import { priyaWeek, seededReviews, type SeedPlanItem } from './seed-week'
import { SEED_LECTURES, withoutSeedRecordings } from './seed-lectures'
import { MAX_RETRIES, POLL_INTERVAL_MS, retryBackoffMs } from '../apps/server/src/workflows/retry-policy'

const DATABASE_URL = resolveDatabaseUrl()

const TABLES = [
  'plan_items', 'user_preferences', 'user_provisioning',
  'job_runs', 'workflow_jobs', 'workflows',
  'workspace_scopes', 'workspace_panels', 'workspaces',
  'confidence_signals', 'links', 'annotations', 'tags',
  'transcript_segments', 'resources', 'recordings', 'lectures',
  // After everything filed under a course (foreign keys).
  'courses',
]

/** Allowance for one attempt's own work (the e2e server's executors are mocks: no real AI). */
const ATTEMPT_MARGIN_MS = 1000

/**
 * How long one due run and all its automatic retries can take to finish
 * (see untilSettled), from the server runner's own schedule: claimed within
 * one poll interval, then each retry waits out its backoff and is claimed
 * within another interval, plus a margin for every attempt's work. With
 * MAX_RETRIES 3, backoffs of 2s, 4s and 8s and a 2s interval:
 * 2 + (2+2) + (4+2) + (8+2) + 4 = 26s.
 *
 * Follow-up jobs are not counted: each hop (queued with no delay, claimed
 * within an interval) takes about 2s when nothing fails, and the engine
 * stops a chain after two hops (maxDepth 3; transcribe -> summary is one),
 * so a chain fits in what a run that needs no retries leaves unused.
 */
export const JOBS_SETTLE_MS = POLL_INTERVAL_MS
  + Array.from({ length: MAX_RETRIES }, (_, i) => retryBackoffMs(i + 1) + POLL_INTERVAL_MS).reduce((a, b) => a + b, 0)
  + (MAX_RETRIES + 1) * ATTEMPT_MARGIN_MS

/**
 * How long one other session may stay mid-way through its work before
 * reseed fails (see untilSettled): as long as the e2e fixture lets a
 * request run (api-requests.ts, settle).
 */
export const SESSIONS_SETTLE_MS = 10_000

/** Where reseed writes, as "host:port/database" (never the credentials). */
export function reseedTarget(): string {
  const url = new URL(DATABASE_URL)
  return `${url.host}${url.pathname}`
}

export interface ReseedOptions {
  /**
   * The instant Priya's week is built around (see ./seed-week.ts). Defaults
   * to the real clock, so a reseed always looks like this week; tests and
   * rehearsals can pin it.
   */
  now?: number
  /** The job runs' part of the overall wait (default JOBS_SETTLE_MS; the cap is this plus `sessionsSettleMs`). */
  jobsSettleMs?: number
  /** How long one other session may stay busy before reseed fails (default SESSIONS_SETTLE_MS). */
  sessionsSettleMs?: number
}

export async function reseed({
  now = Date.now(),
  jobsSettleMs = JOBS_SETTLE_MS,
  sessionsSettleMs = SESSIONS_SETTLE_MS,
}: ReseedOptions = {}) {
  // postgres is a dependency of @pls/db, not the root — resolve it from there.
  const requireFromDb = createRequire(resolve(__dirname, '../packages/db/package.json'))
  const pg = await import(requireFromDb.resolve('postgres'))
  // Named, so the Postgres log (a lock report, a deadlock) says it was reseed.
  const sql = pg.default(DATABASE_URL, { max: 1, connection: { application_name: 'reseed' } })

  try {
    await untilSettled(sql, jobsSettleMs, sessionsSettleMs)
    // One transaction: the server never sees a half-seeded student. Data
    // only (no DDL), so it takes no table locks the running server waits on.
    await sql.begin(async (tx: Sql) => {
      for (const table of TABLES) {
        await tx.unsafe(`DELETE FROM ${table} WHERE user_id = 'dev-user-1'`)
      }
      // Biology, Chemistry and Physics before anything filed under them (a
      // new student starts with none; the seeded one has the demo's three).
      await insertStarterCourses(tx)
      // The seeded lectures and their recordings next: 002 inserts its
      // recordings the old way (no lecture), so reseed writes them itself.
      await insertSeedLectures(tx)

      // 002 seeds reference data; 008 seeds the freeform-canvas panels (pixel
      // columns), since 006 replaced the grid columns 002 originally used;
      // 010 moves the seeded recording focus from panel config to the
      // workspace scope; 012 drops the timeframe scope rows 002 still inserts;
      // 013 swaps the stub automations for the lecture AI ones; 014 resizes
      // the seeded panels for the redesigned widget chrome.
      for (const file of ['002_seed.sql', '008_seed_panels.sql', '010_seed_recording_focus.sql', '012_drop_timeframe_scope.sql', '013_lecture_ai_automations.sql', '014_seed_panel_sizes.sql']) {
        let seedSql = readFileSync(
          resolve(__dirname, `../packages/db/src/migrations/${file}`),
          'utf-8',
        )
        if (file === '002_seed.sql') seedSql = withoutSeedRecordings(seedSql)
        await tx.unsafe(seedSql)
      }
      await fileSeedsUnderLectures(tx)

      await insertPlanItems(tx, [...priyaWeek(now), ...seededReviews()])
      await insertSeedResources(tx)
      await linkLecturesToClasses(tx)
    })
  } finally {
    await sql.end()
  }
}

/**
 * Waits until nothing left over from the last test can still write while
 * reseed deletes:
 *
 * - No other session on the database is mid-way through its work. A request
 *   the browser gave up on (a page navigating away) may still be running on
 *   the server, out of the e2e fixture's sight: its transaction holds the
 *   student's rows in its own lock order. Pool connections waiting idle, and
 *   reseed's own, don't count (see busySessions).
 * - None of the student's job runs is running, or pending and due before the
 *   deadline (the runner would claim it meanwhile). A run the last test
 *   started, such as the review job a "confusing" tag queues, writes under
 *   rows reseed deletes, in its own lock order: reseeding alongside it
 *   deadlocks, or leaves its writes in the fresh seed. Runs due later, such
 *   as the week-later quiz the same tag queues, are just deleted. The e2e
 *   fixture (e2e/test.ts) lets the last test's requests finish first, so no
 *   new runs are queued meanwhile.
 *
 * Each pass checks the sessions first, and the runs once no session is
 * busy: a session that commits a new run before the runs are checked is
 * then seen there. One deadline covers the whole wait, `jobsSettleMs +
 * sessionsSettleMs` from now (26s + 10s = 36s by default): a run may need
 * its whole settle time after the session that queued it took up to its
 * own. A single session busy for `sessionsSettleMs` fails sooner. Either way
 * it fails naming what is still going.
 */
async function untilSettled(sql: Sql, jobsSettleMs: number, sessionsSettleMs: number) {
  const capMs = jobsSettleMs + sessionsSettleMs
  // On the database's clock, as run_after is.
  const [{ deadline }] = await sql`SELECT now() + ${capMs + 'ms'}::interval AS deadline`
  const giveUpAt = Date.now() + capMs
  const firstSeen = new Map<string, number>()
  for (;;) {
    const busy = await busySessions(sql)
    const now = Date.now()
    const stuck = busy.filter((session: Sql) => {
      // The same transaction, or the same statement outside one.
      const key = `${session.pid}@${(session.since as Date | null)?.toISOString()}`
      if (!firstSeen.has(key)) firstSeen.set(key, now)
      return now - firstSeen.get(key)! >= sessionsSettleMs
    })
    if (stuck.length > 0) {
      throw new Error(`reseed: other sessions on the database did not finish within ${sessionsSettleMs}ms: ${describeSessions(stuck)}`)
    }
    const runs = busy.length === 0 || now >= giveUpAt ? await unfinishedRuns(sql, deadline) : null
    if (busy.length === 0 && runs!.length === 0) return
    if (now >= giveUpAt) {
      const open = [
        ...(busy.length > 0 ? [`sessions still busy: ${describeSessions(busy)}`] : []),
        ...(runs!.length > 0 ? [`the student's job runs still unfinished: ${describeRuns(runs!)}`] : []),
      ]
      throw new Error(`reseed: the database did not settle within ${capMs}ms: ${open.join('; ')}`)
    }
    // Checked again shortly: the job runner claims queued runs every 2s.
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** Other sessions on this database running a statement or inside a transaction. */
function busySessions(sql: Sql) {
  return sql`
    SELECT pid, state, application_name, query, coalesce(xact_start, query_start) AS since
    FROM pg_stat_activity
    WHERE datname = current_database() AND backend_type = 'client backend'
      AND pid <> pg_backend_pid() AND application_name <> 'reseed' AND state <> 'idle'
    ORDER BY pid
  `
}

function describeSessions(sessions: Sql[]): string {
  return sessions.map((session: Sql) =>
    `pid ${session.pid} (${session.state}${session.application_name ? `, ${session.application_name}` : ''}): ${String(session.query).replace(/\s+/g, ' ').trim().slice(0, 200)}`,
  ).join('; ')
}

/** The student's job runs that are running, or pending and due by `deadline`. */
function unfinishedRuns(sql: Sql, deadline: Date) {
  return sql`
    SELECT id, job_type, status, retry_count, run_after FROM job_runs
    WHERE user_id = 'dev-user-1' AND status NOT IN ('completed', 'failed')
      AND (status <> 'pending' OR run_after <= ${deadline})
    ORDER BY created_at
  `
}

function describeRuns(runs: Sql[]): string {
  return runs.map((run: Sql) =>
    `${run.id} (${run.job_type}, ${run.status}, retry ${run.retry_count}, run after ${(run.run_after as Date).toISOString()})`,
  ).join('; ')
}

// `postgres` is resolved at runtime from @pls/db (see above), so its types
// are not visible here.
type Sql = any

/** Gives dev-user-1 the three starter courses. */
async function insertStarterCourses(sql: Sql) {
  for (const course of STARTER_COURSES) {
    await sql`INSERT INTO courses ${sql({ ...course, user_id: 'dev-user-1' })}`
  }
}

/** Inserts SEED_LECTURES for dev-user-1, each with its recording. */
async function insertSeedLectures(sql: Sql) {
  for (const { id, title, course, startsAt, recording } of SEED_LECTURES) {
    await sql`
      INSERT INTO lectures (id, user_id, title, course, starts_at, created_at, updated_at)
      VALUES (${id}, 'dev-user-1', ${title}, ${course}, ${startsAt}, ${startsAt}, ${startsAt})
    `
    await sql`
      INSERT INTO recordings (id, user_id, lecture_id, title, created_at, duration, audio_url, status)
      VALUES (${recording.id}, 'dev-user-1', ${id}, ${title}, ${startsAt}, ${recording.durationMs}, NULL, 'ready')
    `
  }
}

/**
 * Brings what the older SQL seeds write into the lectures model, as the
 * lectures migration does for real data: no course tags on recordings (the
 * lecture holds the course), and each seeded board focus (010, a
 * 'recording' row) becomes that recording's lecture, with the board course
 * set to the lecture's.
 */
async function fileSeedsUnderLectures(sql: Sql) {
  await sql`
    DELETE FROM tags
    WHERE user_id = 'dev-user-1' AND target_type = 'recording' AND label IN ('biology', 'chemistry', 'physics')
  `
  const focus = await sql`
    DELETE FROM workspace_scopes ws
    USING recordings r JOIN lectures l ON l.id = r.lecture_id
    WHERE ws.user_id = 'dev-user-1' AND ws.scope_type = 'recording' AND r.id = ws.scope_value AND r.user_id = ws.user_id
    RETURNING ws.workspace_id, l.id AS lecture_id, l.course
  `
  for (const { workspace_id, lecture_id, course } of focus) {
    const rows: [string, string | null][] = [['lecture', lecture_id], ['tag', course]]
    for (const [scopeType, value] of rows) {
      await sql`DELETE FROM workspace_scopes WHERE workspace_id = ${workspace_id} AND scope_type = ${scopeType}`
      if (value === null) continue
      await sql`
        INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value)
        VALUES ('dev-user-1', ${workspace_id}, ${scopeType}, ${value})
      `
    }
  }
  const [{ remaining }] = await sql`SELECT count(*)::int AS remaining FROM workspace_scopes WHERE user_id = 'dev-user-1' AND scope_type = 'recording'`
  if (remaining > 0) throw new Error(`Reseed left ${remaining} board focus row(s) on a recording`)
}

/**
 * A couple of resources for the Resources widget: the Biology reading list
 * (a Google Doc) for the course, and a note on the Mitochondrial DNA lecture.
 */
export const SEED_RESOURCES = [
  {
    id: 'res-bio-reading-list',
    kind: 'link',
    title: 'Biology reading list',
    url: 'https://docs.google.com/document/d/1bioReadingList/edit',
    provider: 'google_doc',
    body_md: null,
    lecture_id: null,
    course: 'biology',
  },
  {
    id: 'res-mtdna-notes',
    kind: 'note',
    title: 'Mitochondrial DNA - key points',
    url: null,
    provider: null,
    body_md: [
      '## Key points',
      '',
      '- Inherited from the **mother** only',
      '- Circular, about 16,500 base pairs',
      '- [ ] Ask about heteroplasmy in the seminar',
    ].join('\n'),
    lecture_id: 'lec-rec-bio-4',
    course: null,
  },
] as const

async function insertSeedResources(sql: Sql) {
  for (const resource of SEED_RESOURCES) {
    await sql`INSERT INTO resources ${sql({ ...resource, user_id: 'dev-user-1' })}`
  }
}

/**
 * Links lectures to their class occurrences where unambiguous, as migration
 * 020 did for real data. Its own SQL (e2e/link-lectures-to-classes.sql):
 * 020 reads a class's course from the 'plan_item' tags that migration 025
 * replaced with `plan_items.course`.
 */
export async function linkLecturesToClasses(sql: Sql) {
  await sql.unsafe(readFileSync(resolve(__dirname, 'link-lectures-to-classes.sql'), 'utf-8'))
}

/** Inserts plan items for dev-user-1 with their course, as the server stores them. */
export async function insertPlanItems(sql: Sql, items: SeedPlanItem[]) {
  for (const { id, course, created_at, updated_at, ...item } of items) {
    const invalid = validatePlanItem(item)
    if (invalid) throw new Error(`Seed plan item ${id}: ${invalid}`)
    await sql`
      INSERT INTO plan_items ${sql({
        id,
        user_id: 'dev-user-1',
        kind: item.kind,
        title: item.title,
        starts_at: item.starts_at ?? null,
        ends_at: item.ends_at ?? null,
        due_at: item.due_at ?? null,
        duration_min: item.duration_min ?? null,
        status: item.status ?? 'open',
        recurrence: item.recurrence ? sql.json({ ...item.recurrence }) : null,
        subtype: item.subtype ?? null,
        source_type: item.source_type ?? null,
        source_id: item.source_id ?? null,
        source_offset_ms: item.source_offset_ms ?? null,
        created_by_workflow_id: item.created_by_workflow_id ?? null,
        course: course ?? null,
        ...(created_at ? { created_at } : {}),
        ...(updated_at ? { updated_at } : {}),
      })}
    `
  }
}
