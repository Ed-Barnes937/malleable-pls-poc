import type { JobRunner, JobRunnerConfig, RunnerEvent } from './types'

const DEFAULT_INTERVAL_MS = 1000
const DEFAULT_MAX_RETRIES = 0

export function createJobRunner(config: JobRunnerConfig): JobRunner {
  const {
    adapter,
    executors,
    engine,
    scopeId,
    pollIntervalMs = DEFAULT_INTERVAL_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = config

  let intervalHandle: ReturnType<typeof setInterval> | null = null
  let processing = false
  const listeners = new Set<(event: RunnerEvent) => void>()

  function emit(event: RunnerEvent) {
    for (const listener of listeners) {
      listener(event)
    }
  }

  async function processOnce(): Promise<void> {
    if (processing) return
    processing = true

    try {
      const batch = await adapter.claimPendingJobRuns()
      for (const job of batch) {
        // Skip if the adapter claimed atomically and already set status='running'
        // (pg runner path). sql.js adapter returns 'pending' so the update still runs.
        if (job.status !== 'running') {
          await adapter.updateJobRunStatus(job.id, 'running')
          await adapter.commit?.()
        }
        const runningJob = { ...job, status: 'running' as const }
        emit({ type: 'job:started', jobRun: runningJob })

        try {
          const input = job.input ?? {}
          const result = await executors.execute(job.job_type, input, {
            scopeId,
            depth: job.depth,
            jobRun: job,
          })

          await adapter.updateJobRunStatus(job.id, 'completed', result.output, undefined)
          await adapter.commit?.()
          const completedJob = {
            ...job,
            status: 'completed' as const,
            output: result.output,
          }
          emit({ type: 'job:completed', jobRun: completedJob, result })

          if (result.events) {
            for (const event of result.events) {
              // Cascade at job.depth — engine.dispatch adds +1 so children land
              // at job.depth + 1. This fixes the prior cross-backend divergence.
              await engine.dispatch(event, { scopeId, depth: job.depth })
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await adapter.updateJobRunStatus(job.id, 'failed', undefined, message)
          await adapter.commit?.()
          const failedJob = { ...job, status: 'failed' as const, error: message }
          emit({ type: 'job:failed', jobRun: failedJob, error: message })

          // Retry decision lives in the core; backoff scheduling lives in the
          // adapter (server sets run_after via retryCount).
          if (job.retry_count < maxRetries) {
            await adapter.enqueueJobRun({
              workflowId: job.workflow_id,
              workflowJobId: job.workflow_job_id,
              jobType: job.job_type,
              input: job.input ?? {},
              depth: job.depth,
              retryCount: job.retry_count + 1,
            })
            await adapter.commit?.()
          }
        }
      }
    } finally {
      processing = false
    }
  }

  function start(intervalMs: number = pollIntervalMs): void {
    if (intervalHandle !== null) return
    intervalHandle = setInterval(() => {
      void processOnce()
    }, intervalMs)
  }

  function stop(): void {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  }

  function isRunning(): boolean {
    return intervalHandle !== null
  }

  function onEvent(listener: (event: RunnerEvent) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { start, stop, processOnce, isRunning, onEvent }
}
