import { sql } from '@pls/db'
import { createJobRunner, createWorkflowEngine, type ExecutorRegistry, type RunnerEvent } from '@pls/workflows'
import { createPgAdapter } from './pg-adapter'
import { emitEvent } from '../routers/events'

/** Automatic retries after a failed attempt; a run that exhausts them can be retried by hand. */
export const MAX_RETRIES = 3
const POLL_INTERVAL_MS = 2000

/**
 * Translate a core RunnerEvent into the server's ServerEvent shape (adding
 * userId) and push it onto the EventBus. The server surfaces job:started /
 * job:completed / job:failed in the workflow UI, so all three are forwarded.
 * Failures flag `willRetry` so the UI only alarms the student on the last one.
 */
function bridgeRunnerEvent(userId: string, event: RunnerEvent) {
  emitEvent({
    type: event.type,
    jobType: event.jobRun.job_type,
    userId,
    ...(event.type === 'job:failed' ? { willRetry: event.jobRun.retry_count < MAX_RETRIES } : {}),
  })
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
      maxRetries: MAX_RETRIES,
    })

    const unsubscribe = runner.onEvent((event) => bridgeRunnerEvent(user_id, event))
    try {
      await runner.processOnce()
    } finally {
      unsubscribe()
    }
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

export function startJobRunner(executors: ExecutorRegistry) {
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
