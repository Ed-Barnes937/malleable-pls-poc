import { sql } from '@pls/db'
import { createJobRunner, createWorkflowEngine, type ExecutorRegistry, type JobRun, type RunnerEvent } from '@pls/workflows'
import { createPgAdapter } from './pg-adapter'
import { emitEvent } from '../routers/events'

/**
 * Automatic retries after a failed attempt; a run that exhausts them can be
 * retried by hand. Executors that call a paid AI provider opt out via
 * `ExecutorMeta.maxRetries: 0` (see executors.ts).
 */
export const MAX_RETRIES = 3

/** Automatic retries allowed for a job type: its executor's own limit, else MAX_RETRIES. */
export function retryLimitFor(executors: ExecutorRegistry, jobType: string): number {
  return executors.getMeta(jobType)?.maxRetries ?? MAX_RETRIES
}
const POLL_INTERVAL_MS = 2000

/**
 * Translate a core RunnerEvent into the server's ServerEvent shape (adding
 * userId) and push it onto the EventBus. The server surfaces job:started /
 * job:completed / job:failed in the workflow UI, so all three are forwarded.
 * Failures flag `willRetry` so the UI only alarms the student on the last one.
 */
function bridgeRunnerEvent(executors: ExecutorRegistry, userId: string, event: RunnerEvent) {
  const retryLimit = retryLimitFor(executors, event.jobRun.job_type)
  emitEvent({
    type: event.type,
    jobType: event.jobRun.job_type,
    userId,
    ...(event.type === 'job:failed' ? { willRetry: event.jobRun.retry_count < retryLimit } : {}),
    // Executors flag runs that did nothing visible with `output.quiet`.
    ...(event.type === 'job:completed' && event.result.output.quiet === true ? { quiet: true } : {}),
  })
}

/** The board a job was dispatched on (stored as `input._workspaceId` by the pg adapter), or null. */
export function jobBoard(job: JobRun): string | null {
  const board = job.input?._workspaceId
  return typeof board === 'string' && board ? board : null
}

async function processJobs(executors: ExecutorRegistry): Promise<void> {
  const users = await sql<{ user_id: string }[]>`
    SELECT DISTINCT user_id FROM job_runs WHERE status = 'pending' LIMIT 20
  `

  for (const { user_id } of users) {
    // { sql } mode: each adapter call owns its own short tx + set_config.
    // No outer sql.begin — executor I/O runs outside any transaction.
    const adapter = createPgAdapter({ sql, userId: user_id })
    const engine = createWorkflowEngine({ adapter })
    const runner = createJobRunner({
      adapter,
      executors,
      engine,
      scopeId: null,
      scopeForJob: jobBoard,
      maxRetries: MAX_RETRIES,
    })

    const unsubscribe = runner.onEvent((event) => bridgeRunnerEvent(executors, user_id, event))
    try {
      await runner.processOnce()
    } finally {
      unsubscribe()
    }
  }
}

/** Error recorded on runs a server restart cut off. */
export const INTERRUPTED_ERROR = 'Interrupted: the server restarted while this was running'

/**
 * Marks every run still 'running' as failed. Called once at start-up, before
 * this server claims anything: a run is only ever 'running' inside a live
 * server's runner (one server per database), so these were cut off by a
 * restart and would otherwise show as in progress forever. Retries are
 * counted as used up, so the student gets the retry button instead of an
 * automatic re-run (which could bill an AI provider twice).
 */
export async function failInterruptedJobs(
  executors: ExecutorRegistry,
  /** Tests only: limit to one user's runs, so a shared test database's other runs are untouched. */
  options: { userId?: string } = {},
): Promise<number> {
  const rows = await sql<{ id: string; job_type: string }[]>`
    SELECT id, job_type FROM job_runs
    WHERE status = 'running' ${options.userId ? sql`AND user_id = ${options.userId}` : sql``}
  `
  for (const row of rows) {
    await sql`
      UPDATE job_runs
      SET status = 'failed', error = ${INTERRUPTED_ERROR}, completed_at = now(),
          retry_count = GREATEST(retry_count, ${retryLimitFor(executors, row.job_type)})
      WHERE id = ${row.id} AND status = 'running'
    `
  }
  return rows.length
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

export async function startJobRunner(executors: ExecutorRegistry) {
  if (intervalHandle) return
  try {
    const interrupted = await failInterruptedJobs(executors)
    if (interrupted > 0) console.log(`marked ${interrupted} interrupted job run(s) failed`)
  } catch (err) {
    console.error('could not clear interrupted job runs:', err)
  }
  if (intervalHandle) return
  console.log(`job runner started (polling every ${POLL_INTERVAL_MS}ms)`)
  intervalHandle = setInterval(() => {
    processJobs(executors).catch((err) => console.error('job runner error:', err))
  }, POLL_INTERVAL_MS)
}

export function stopJobRunner() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
