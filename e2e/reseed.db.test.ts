// @vitest-environment node
/**
 * reseed() alongside work the last e2e test left behind, against a real
 * Postgres (opt-in like the server's db tests: TEST_DATABASE_URL points at a
 * migrated database). Only touches dev-user-1, which no other db test uses.
 * Each case replays the server's steps by hand, in its order, so the race is
 * deterministic.
 *
 * reseed waits for every other session on its database to finish what it is
 * doing, and the other db test files share TEST_DATABASE_URL, running at the
 * same time. So this file reseeds a database of its own, made (and migrated)
 * next to that one and dropped when it is done.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { ReseedOptions } from './reseed'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('reseed (Postgres)', () => {
  // postgres is a dependency of @pls/db, not the root: untyped here, as in reseed.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Sql = any
  let pg: Sql
  let sql: Sql
  let reseed: (options?: ReseedOptions) => Promise<void>
  const ownUrl = new URL(TEST_DATABASE_URL ?? 'postgres://unused/unused')
  const ownDb = `${decodeURIComponent(ownUrl.pathname.slice(1))}_reseed`
  ownUrl.pathname = `/${ownDb}`

  /** Runs `fn` on a connection to TEST_DATABASE_URL (to create or drop this file's database). */
  async function onSharedDb(fn: (admin: Sql) => Promise<unknown>) {
    const admin = pg.default(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} })
    try { await fn(admin) } finally { await admin.end() }
  }

  beforeAll(async () => {
    pg = await import(createRequire(resolve(__dirname, '../packages/db/package.json')).resolve('postgres'))
    await onSharedDb(async (admin) => {
      await admin`DROP DATABASE IF EXISTS ${admin(ownDb)} WITH (FORCE)`
      await admin`CREATE DATABASE ${admin(ownDb)}`
    })
    execFileSync(resolve(__dirname, '../packages/db/node_modules/.bin/tsx'), [resolve(__dirname, '../packages/db/src/migrate.ts')], {
      env: { ...process.env, DATABASE_URL: ownUrl.href },
      stdio: 'pipe',
    })
    process.env.DATABASE_URL = ownUrl.href
    sql = pg.default(ownUrl.href, { max: 4, onnotice: () => {} })
    ;({ reseed } = await import('./reseed'))
  }, 60_000)

  beforeEach(async () => { await reseed() })

  afterAll(async () => {
    await sql?.end()
    if (pg) await onSharedDb((admin) => admin`DROP DATABASE IF EXISTS ${admin(ownDb)} WITH (FORCE)`)
  })

  const count = async (query: Sql) => (await query)[0].n as number

  /** How many sessions are waiting for a lock the session `holder` holds. */
  const waitingOn = (holder: number) =>
    count(sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${holder}::int = ANY(pg_blocking_pids(pid))`)

  /** Whether reseed's connection last checked (or is checking) `what`: 'job_runs' or 'pg_stat_activity'. */
  const reseedChecking = (what: string) => () =>
    count(sql`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'reseed' AND query LIKE ${`%FROM ${what}%`}
    `)
  const checkingJobs = reseedChecking('job_runs')
  const checkingSessions = reseedChecking('pg_stat_activity')

  /** A transaction that runs `first`, then waits for the returned `go()` before running `then`. */
  function inTwoSteps(first: (tx: Sql) => Promise<unknown>, then: (tx: Sql) => Promise<unknown>) {
    let holder = 0
    let started!: () => void
    const firstDone = new Promise<void>((done) => { started = done })
    let go!: () => void
    const going = new Promise<void>((resolve) => { go = resolve })
    const done = sql.begin(async (tx: Sql) => {
      holder = (await tx`SELECT pg_backend_pid() AS pid`)[0].pid as number
      await first(tx)
      started()
      await going
      await then(tx)
      return 'committed'
    })
    return { started: firstDone.then(() => holder), go, done }
  }

  /** A review job's run, claimed by the job runner (its own committed transaction, as claimPendingJobRuns). */
  const claimReviewJob = async () =>
    (await sql`
      INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, status, started_at)
      VALUES ('dev-user-1', 'wf-confused-review', 'wfj-confused-review', 'plan:review-task', 'running', now())
      RETURNING id
    `)[0].id as string

  it('waits for a review job the last test started to finish, rather than deadlocking with it', async () => {
    const runId = await claimReviewJob()
    // The review job's writes, in its order (workflows/executors.ts, planning/review-automation.ts):
    // its recording held FOR KEY SHARE, then a plan item credited to the automation,
    // whose foreign key holds the automation row FOR KEY SHARE too.
    const job = inTwoSteps(
      (tx) => tx`SELECT 1 FROM recordings WHERE id = 'rec-bio-4' FOR KEY SHARE`,
      (tx) => tx`
        INSERT INTO plan_items (user_id, kind, title, status, subtype, source_type, source_id, source_offset_ms, created_by_workflow_id)
        VALUES ('dev-user-1', 'task', 'Review: a late mark', 'open', 'review', 'recording', 'rec-bio-4', 0, 'wf-confused-review')
      `,
    )
    const holder = await job.started

    // The next test's reseed starts while the job is under way: it waits for
    // the job's transaction (not blocked on its locks)...
    const reseeding = reseed()
    await expect.poll(checkingSessions).toBeGreaterThan(0)
    expect(await waitingOn(holder)).toBe(0)
    // ...the job goes on to its plan item, and reseed waits for its run...
    job.go()
    await expect(job.done).resolves.toBe('committed')
    await expect.poll(checkingJobs).toBeGreaterThan(0)
    // ...until the runner marks it done.
    await sql`UPDATE job_runs SET status = 'completed', completed_at = now() WHERE id = ${runId}`
    await expect(reseeding).resolves.toBeUndefined()
    // The reseed ran after the job: what the job wrote is gone.
    expect(await count(sql`SELECT count(*)::int AS n FROM plan_items WHERE title = 'Review: a late mark'`)).toBe(0)
  })

  it('gives up on a job that does not finish, naming it, before it deletes anything', async () => {
    const runId = await claimReviewJob()
    await expect(reseed({ jobsSettleMs: 300 })).rejects.toThrow(
      new RegExp(`job runs did not finish within 300ms of being due: ${runId} \\(plan:review-task, running, retry 0, `),
    )
    expect(await count(sql`SELECT count(*)::int AS n FROM job_runs WHERE id = ${runId}`)).toBe(1)
    await sql`UPDATE job_runs SET status = 'failed', completed_at = now() WHERE id = ${runId}`
  })

  it('does not wait for a run not due until well after the wait, and deletes it', async () => {
    // The week-later quiz a "confusing" tag queues (wfj-confused-quiz).
    const [{ id: runId }] = await sql`
      INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, run_after)
      VALUES ('dev-user-1', 'wf-confused-search', 'wfj-confused-quiz', 'schedule:quiz', now() + interval '7 days')
      RETURNING id
    `
    await expect(reseed({ jobsSettleMs: 300 })).resolves.toBeUndefined()
    expect(await count(sql`SELECT count(*)::int AS n FROM job_runs WHERE id = ${runId}`)).toBe(0)
  })

  it('waits for a run that falls due during the wait', async () => {
    const [{ id: runId }] = await sql`
      INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, run_after)
      VALUES ('dev-user-1', 'wf-confused-review', 'wfj-confused-review', 'plan:review-task', now() + interval '30 seconds')
      RETURNING id
    `
    let settled = false
    const reseeding = reseed({ jobsSettleMs: 60_000 }).finally(() => { settled = true })
    await expect.poll(checkingJobs).toBeGreaterThan(0)
    expect(settled).toBe(false)
    expect(await count(sql`SELECT count(*)::int AS n FROM job_runs WHERE id = ${runId}`)).toBe(1)
    // The runner claims it when due, and it finishes.
    await sql`UPDATE job_runs SET status = 'completed', completed_at = now() WHERE id = ${runId}`
    await expect(reseeding).resolves.toBeUndefined()
  })

  it('waits for a resource edit still saving, rather than deadlocking with it', async () => {
    // resources.update's order (routers/resources.ts): the resource FOR UPDATE,
    // then the lecture it is filed under FOR KEY SHARE (requireOwnLecture,
    // then the row's foreign key). No one order of reseed's deletes stays
    // clear of every such path, so reseed lets it finish before deleting.
    const edit = inTwoSteps(
      (tx) => tx`SELECT 1 FROM resources WHERE id = 'res-mtdna-notes' FOR UPDATE`,
      async (tx) => {
        await tx`SELECT 1 FROM lectures WHERE id = 'lec-rec-bio-4' FOR KEY SHARE`
        await tx`UPDATE resources SET title = 'An edit still saving', lecture_id = 'lec-rec-bio-4' WHERE id = 'res-mtdna-notes'`
      },
    )
    const holder = await edit.started

    const reseeding = reseed()
    await expect.poll(checkingSessions).toBeGreaterThan(0)
    // Waiting for the edit, not blocked on its locks.
    expect(await waitingOn(holder)).toBe(0)
    edit.go()
    await expect(edit.done).resolves.toBe('committed')
    await expect(reseeding).resolves.toBeUndefined()
    expect(await count(sql`SELECT count(*)::int AS n FROM resources WHERE title = 'An edit still saving'`)).toBe(0)
  })

  /** Renames the seeded note, so a test can tell whether reseed has run (it renames it back). */
  const markNote = () => sql`UPDATE resources SET title = 'Not reseeded yet' WHERE id = 'res-mtdna-notes'`
  const noteMarked = () => count(sql`SELECT count(*)::int AS n FROM resources WHERE title = 'Not reseeded yet'`)

  it('waits for a transaction still open on the database, then goes ahead once it ends', async () => {
    // Such as a request the browser gave up on that the server is still
    // running: it need not have touched the student's rows yet.
    await markNote()
    const open = inTwoSteps((tx) => tx`SELECT 1`, async () => {})
    await open.started
    let settled = false
    const reseeding = reseed().finally(() => { settled = true })

    await expect.poll(checkingSessions).toBeGreaterThan(0)
    expect(settled).toBe(false)
    expect(await noteMarked()).toBe(1)

    open.go()
    await expect(open.done).resolves.toBe('committed')
    await expect(reseeding).resolves.toBeUndefined()
    expect(await noteMarked()).toBe(0)
  })

  it('gives up on a session that does not finish, naming its state and query, before it deletes anything', async () => {
    await markNote()
    const open = inTwoSteps((tx) => tx`SELECT 'still saving' AS step`, async () => {})
    const holder = await open.started

    await expect(reseed({ sessionsSettleMs: 300 })).rejects.toThrow(
      `reseed: other sessions on the database did not finish within 300ms: pid ${holder} (idle in transaction, postgres.js): SELECT 'still saving' AS step`,
    )
    expect(await noteMarked()).toBe(1)
    open.go()
    await expect(open.done).resolves.toBe('committed')
  })
})
