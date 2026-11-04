// @vitest-environment node
/**
 * reseed() alongside work the last e2e test left behind, against a real
 * Postgres (opt-in like the server's db tests: TEST_DATABASE_URL points at a
 * migrated database). Only touches dev-user-1, which no other db test uses.
 * Each case replays the server's steps by hand, in its order, so the race is
 * deterministic.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { ReseedOptions } from './reseed'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('reseed (Postgres)', () => {
  // postgres is a dependency of @pls/db, not the root: untyped here, as in reseed.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Sql = any
  let sql: Sql
  let reseed: (options?: ReseedOptions) => Promise<void>

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    const pg = await import(createRequire(resolve(__dirname, '../packages/db/package.json')).resolve('postgres'))
    sql = pg.default(TEST_DATABASE_URL!, { max: 4, onnotice: () => {} })
    ;({ reseed } = await import('./reseed'))
  })

  beforeEach(async () => { await reseed() })

  afterAll(async () => {
    await reseed()
    await sql?.end()
  })

  const count = async (query: Sql) => (await query)[0].n as number

  /** How many sessions are waiting for a lock the session `holder` holds. */
  const waitingOn = (holder: number) =>
    count(sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${holder}::int = ANY(pg_blocking_pids(pid))`)

  /** Whether reseed's connection is checking this database's job runs. */
  const checkingJobs = () =>
    count(sql`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'reseed' AND query LIKE '%FROM job_runs%'
    `)

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
    // the run (or, deleting first, for the job's recording)...
    const reseeding = reseed()
    await expect.poll(async () => (await checkingJobs()) + (await waitingOn(holder))).toBeGreaterThan(0)
    // ...and the job goes on to its plan item, then the runner marks the run done.
    job.go()
    await expect(job.done).resolves.toBe('committed')
    await sql`UPDATE job_runs SET status = 'completed', completed_at = now() WHERE id = ${runId}`
    await expect(reseeding).resolves.toBeUndefined()
    // The reseed ran after the job: what the job wrote is gone.
    expect(await count(sql`SELECT count(*)::int AS n FROM plan_items WHERE title = 'Review: a late mark'`)).toBe(0)
  })

  it('gives up on a job that does not finish, naming it, before it deletes anything', async () => {
    const runId = await claimReviewJob()
    await expect(reseed({ jobsSettleMs: 300 })).rejects.toThrow(
      new RegExp(`job runs did not finish within 300ms: ${runId} \\(plan:review-task, running, retry 0, `),
    )
    expect(await count(sql`SELECT count(*)::int AS n FROM job_runs WHERE id = ${runId}`)).toBe(1)
    await sql`UPDATE job_runs SET status = 'failed', completed_at = now() WHERE id = ${runId}`
  })

  it('does not deadlock with a resource edit still saving', async () => {
    // resources.update's order (routers/resources.ts): the resource FOR UPDATE,
    // then the lecture it is filed under FOR KEY SHARE (requireOwnLecture,
    // then the row's foreign key). The e2e fixture lets requests finish before
    // the next reseed; this checks reseed's own order doesn't fight it either.
    const edit = inTwoSteps(
      (tx) => tx`SELECT 1 FROM resources WHERE id = 'res-mtdna-notes' FOR UPDATE`,
      async (tx) => {
        await tx`SELECT 1 FROM lectures WHERE id = 'lec-rec-bio-4' FOR KEY SHARE`
        await tx`UPDATE resources SET title = 'An edit still saving', lecture_id = 'lec-rec-bio-4' WHERE id = 'res-mtdna-notes'`
      },
    )
    const holder = await edit.started

    const reseeding = reseed()
    await expect.poll(() => waitingOn(holder)).toBe(1)
    edit.go()
    await expect(edit.done).resolves.toBe('committed')
    await expect(reseeding).resolves.toBeUndefined()
    expect(await count(sql`SELECT count(*)::int AS n FROM resources WHERE title = 'An edit still saving'`)).toBe(0)
  })
})
