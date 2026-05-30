import { sql } from '@pls/db'
import { createJobRunner, createWorkflowEngine, type RunnerEvent } from '@pls/workflows'
import { createPgAdapter } from './pg-adapter'
import { serverExecutors } from './executors'
import { emitEvent } from '../routers/events'

const MAX_RETRIES = 3
const POLL_INTERVAL_MS = 2000

/**
 * Translate a core RunnerEvent into the server's ServerEvent shape (adding
 * userId) and push it onto the EventBus. The server surfaces job:started /
 * job:completed / job:failed in the workflow UI, so all three are forwarded.
 */
function bridgeRunnerEvent(userId: string, event: RunnerEvent) {
  emitEvent({ type: event.type, jobType: event.jobRun.job_type, userId })
}

async function processJobs(): Promise<void> {
  const users = await sql<{ user_id: string }[]>`
    SELECT DISTINCT user_id FROM job_runs WHERE status = 'pending' LIMIT 20
  `

  for (const { user_id } of users) {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${user_id}, true)`

      const adapter = createPgAdapter({ sql: tx, userId: user_id })
      // scopeId stays null to match the prior server cascade behaviour
      // (cascades dispatched with workspaceId = null).
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({
        adapter,
        executors: serverExecutors,
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
    })
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

export function startJobRunner() {
  if (intervalHandle) return
  console.log(`job runner started (polling every ${POLL_INTERVAL_MS}ms)`)
  intervalHandle = setInterval(() => {
    processJobs().catch((err) => console.error('job runner error:', err))
  }, POLL_INTERVAL_MS)
}

export function stopJobRunner() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
