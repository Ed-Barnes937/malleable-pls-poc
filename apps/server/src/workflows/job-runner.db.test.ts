// @vitest-environment node
/**
 * Start-up clean-up of runs a server restart cut off, against a real Postgres
 * (opt-in, see routers/plan-items.db.test.ts):
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t15 pnpm test job-runner.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('failInterruptedJobs (Postgres)', () => {
  let db: typeof import('@pls/db')
  let runner: typeof import('./job-runner')
  let caller: ReturnType<typeof import('../router').appRouter.createCaller>
  let executors: ReturnType<typeof import('./executors').createServerExecutors>
  const user = `test-jr-${randomUUID().slice(0, 8)}`
  const rec = `rec-${user}`

  const job = (jobType: string, status: string) => db.withUser(user, async (tx) => {
    const [row] = await tx`
      INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, status, input, started_at, run_after)
      VALUES (${user}, 'wf-test', 'wj-test', ${jobType}, ${status},
              ${tx.json({ recording_id: rec })}, now() - interval '10 minutes', now() + interval '1 hour')
      RETURNING id
    `
    return row!.id as string
  })
  const statusOf = async (id: string) => {
    const [row] = await db.sql`SELECT status, error, retry_count FROM job_runs WHERE id = ${id}`
    return row
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    runner = await import('./job-runner')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('./executors')
    const ai = createAiDeps()
    executors = createServerExecutors(ai)
    caller = appRouter.createCaller({ userId: user, ai, executors })
    await db.withUser(user, (tx) => tx`
      INSERT INTO recordings (id, user_id, title, status) VALUES (${rec}, ${user}, 'Genetics', 'uploaded')
    `)
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'recordings']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [user])
    }
    await db.sql.end()
  })

  it('fails runs left running, so a lecture stops saying "Transcribing..." and offers a retry', async () => {
    const transcribe = await job('ai:transcribe', 'running')
    const other = await job('search:related', 'running')
    const waiting = await job('ai:summarize-lecture', 'pending')
    expect((await caller.recordings.byId(rec))?.processing).toBe('transcribing')

    expect(await runner.failInterruptedJobs(executors)).toBeGreaterThanOrEqual(2)

    expect(await statusOf(transcribe)).toMatchObject({ status: 'failed', error: runner.INTERRUPTED_ERROR })
    // Retries count as used up: no automatic re-run, a retry button instead.
    expect(await statusOf(other)).toMatchObject({ status: 'failed', retry_count: runner.MAX_RETRIES })
    expect(await statusOf(waiting)).toMatchObject({ status: 'pending' })
    const recent = (await caller.jobs.recent(10)) as unknown as { id: string; retryable: boolean }[]
    expect(recent.filter((r) => r.id === transcribe || r.id === other).map((r) => r.retryable)).toEqual([true, true])
    // Only the queued summary is left.
    expect((await caller.recordings.byId(rec))?.processing).toBe('summarising')
  })
})
