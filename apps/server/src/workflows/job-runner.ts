import { sql } from '@pls/db'
import { createPgWorkflowStore } from './pg-store'
import { dispatchWorkflows } from './dispatch'
import { emitEvent } from '../routers/events'

const MAX_RETRIES = 3
const POLL_INTERVAL_MS = 2000
const store = createPgWorkflowStore()

interface JobExecutor {
  (input: Record<string, unknown>): Promise<{
    output: Record<string, unknown>
    events?: Array<{ type: string; payload: Record<string, unknown> }>
  }>
}

const executors = new Map<string, JobExecutor>()

export function registerExecutor(jobType: string, executor: JobExecutor) {
  executors.set(jobType, executor)
}

async function processJobs(): Promise<void> {
  const users = await sql<{ user_id: string }[]>`
    SELECT DISTINCT user_id FROM job_runs WHERE status = 'pending' LIMIT 20
  `

  for (const { user_id } of users) {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${user_id}, true)`
      const pending = await store.getPendingJobRuns(tx, user_id)

      for (const job of pending) {
        const executor = executors.get(job.job_type)
        if (!executor) {
          await store.updateJobRunStatus(tx, job.id, 'failed', undefined, `Unknown job type: ${job.job_type}`)
          continue
        }

        await store.updateJobRunStatus(tx, job.id, 'running')
        emitEvent({ type: 'job:started', jobType: job.job_type, userId: user_id })

        try {
          const input = { ...(job.input ?? {}), _userId: user_id }
          const result = await executor(input)

          await store.updateJobRunStatus(tx, job.id, 'completed', result.output)
          emitEvent({ type: 'job:completed', jobType: job.job_type, userId: user_id })

          if (result.events) {
            for (const event of result.events) {
              await dispatchWorkflows(tx, user_id, event.type, event.payload, null, job.depth)
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await store.updateJobRunStatus(tx, job.id, 'failed', undefined, message)
          emitEvent({ type: 'job:failed', jobType: job.job_type, userId: user_id })

          if (job.retry_count < MAX_RETRIES) {
            await store.enqueueJobRun(
              tx, user_id, job.workflow_id, job.workflow_job_id, job.job_type,
              job.input ?? {},
              job.depth,
              job.retry_count + 1,
            )
          }
        }
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
