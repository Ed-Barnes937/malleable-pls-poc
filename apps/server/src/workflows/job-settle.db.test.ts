// @vitest-environment node
/**
 * The job runner settles a run (its status and what follows from it) in one
 * transaction, against a real Postgres (opt-in, see routers/plan-items.db.test.ts):
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t15 pnpm test job-settle.db
 *
 * Each follow-up or retry is queued through an adapter that first reads the
 * run's status from another connection: what anyone else (the next tick, a
 * reseed waiting for unfinished runs) could see at that moment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { JobResult, StorageAdapter } from '@pls/workflows'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('settling a job run (Postgres)', () => {
  let db: typeof import('@pls/db')
  let workflows: typeof import('@pls/workflows')
  let createPgAdapter: typeof import('./pg-adapter').createPgAdapter
  const user = `test-settle-${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    workflows = await import('@pls/workflows')
    ;({ createPgAdapter } = await import('./pg-adapter'))
    // When a first job is done, a second one follows.
    await db.sql`
      INSERT INTO workflows (id, user_id, source_lens, trigger_event)
      VALUES (${`wf-${user}`}, ${user}, 'test', 'test:first-done')
    `
    await db.sql`
      INSERT INTO workflow_jobs (id, user_id, workflow_id, job_type)
      VALUES (${`wfj-${user}`}, ${user}, ${`wf-${user}`}, 'test:second')
    `
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'workflow_jobs', 'workflows']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [user])
    }
    await db.sql.end()
  })

  const queueFirstRun = async () =>
    (await db.sql`
      INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, input, run_after)
      VALUES (${user}, 'wf-test', 'wj-test', 'test:first', ${db.sql.json({})}, now())
      RETURNING id
    `)[0]!.id as string

  const runs = () => db.sql`
    SELECT job_type, status, retry_count, output, error FROM job_runs WHERE user_id = ${user} ORDER BY created_at, retry_count
  `

  /** The pg runner adapter, noting the run's status (as another connection reads it) whenever a job is queued. */
  function watchedAdapter(runId: () => string, failToQueue?: string) {
    const seen: string[] = []
    const watch = (inner: StorageAdapter): StorageAdapter => ({
      ...inner,
      async enqueueJobRun(args) {
        const [row] = await db.sql`SELECT status FROM job_runs WHERE id = ${runId()}`
        seen.push(`${args.jobType} queued while the run reads ${row!.status}`)
        if (args.jobType === failToQueue) throw new Error('could not queue')
        return inner.enqueueJobRun(args)
      },
      ...(inner.transaction ? { transaction: (fn) => inner.transaction!((tx) => fn(watch(tx))) } : {}),
    })
    return { adapter: watch(createPgAdapter({ sql: db.sql, userId: user })), seen }
  }

  async function runOnce(execute: () => Promise<JobResult>, options: { failToQueue?: string } = {}) {
    await db.sql`DELETE FROM job_runs WHERE user_id = ${user}`
    const runId = await queueFirstRun()
    const { adapter, seen } = watchedAdapter(() => runId, options.failToQueue)
    const executors = workflows.createExecutorRegistry()
    executors.register('test:first', execute, { label: 'First', category: 'Test' })
    const engine = workflows.createWorkflowEngine({ adapter })
    const runner = workflows.createJobRunner({ adapter, executors, engine, scopeId: null, maxRetries: 1 })
    await runner.processOnce()
    return seen
  }

  it('commits a completed run together with its follow-up jobs', async () => {
    const seen = await runOnce(async () => ({ output: { done: true }, events: [{ type: 'test:first-done', payload: {} }] }))

    expect(seen).toEqual(['test:second queued while the run reads running'])
    expect(await runs()).toMatchObject([
      { job_type: 'test:first', status: 'completed', output: { done: true } },
      { job_type: 'test:second', status: 'pending' },
    ])
  })

  it('commits a failed run together with its retry', async () => {
    const seen = await runOnce(async () => { throw new Error('boom') })

    expect(seen).toEqual(['test:first queued while the run reads running'])
    expect(await runs()).toMatchObject([
      { job_type: 'test:first', status: 'failed', retry_count: 0, error: 'boom' },
      { job_type: 'test:first', status: 'pending', retry_count: 1 },
    ])
  })

  it('rolls the completion back when a follow-up cannot be queued, then fails the run and retries it', async () => {
    const seen = await runOnce(
      async () => ({ output: { done: true }, events: [{ type: 'test:first-done', payload: {} }] }),
      { failToQueue: 'test:second' },
    )

    expect(seen).toEqual([
      'test:second queued while the run reads running',
      'test:first queued while the run reads running',
    ])
    // Never completed: no output, no follow-up; the retry runs the job again.
    expect(await runs()).toMatchObject([
      { job_type: 'test:first', status: 'failed', retry_count: 0, output: null, error: 'could not queue' },
      { job_type: 'test:first', status: 'pending', retry_count: 1 },
    ])
  })
})
