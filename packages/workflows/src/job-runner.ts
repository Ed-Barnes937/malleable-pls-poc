import type { JobRunner, JobRunnerConfig, RunnerEvent, StorageAdapter, WorkflowEngine } from './types'

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
    scopeForJob = () => scopeId,
  } = config

  let intervalHandle: ReturnType<typeof setInterval> | null = null
  let processing = false
  const listeners = new Set<(event: RunnerEvent) => void>()

  function emit(event: RunnerEvent) {
    for (const listener of listeners) {
      listener(event)
    }
  }

  /**
   * Runs `fn` in one adapter transaction when the adapter has them (see
   * StorageAdapter.transaction), with an engine that dispatches inside it;
   * otherwise against the adapter itself, then commits.
   */
  async function settle(fn: (tx: StorageAdapter, txEngine: WorkflowEngine) => Promise<void>): Promise<void> {
    if (adapter.transaction) {
      await adapter.transaction((tx) => fn(tx, engine.withAdapter(tx)))
      return
    }
    await fn(adapter, engine)
    await adapter.commit?.()
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
        const jobScope = scopeForJob(job)
        emit({ type: 'job:started', jobRun: runningJob })

        try {
          const input = job.input ?? {}
          const result = await executors.execute(job.job_type, input, {
            scopeId: jobScope,
            depth: job.depth,
            jobRun: job,
          })

          // The run's status and its follow-up jobs commit together, so no
          // one (the next tick, a reseed waiting for unfinished runs) sees it
          // completed before its follow-ups are queued, and a crash between
          // the two cannot lose them.
          await settle(async (tx, txEngine) => {
            await tx.updateJobRunStatus(job.id, 'completed', result.output, undefined)
            for (const event of result.events ?? []) {
              // Cascade at job.depth - engine.dispatch adds +1 so children land
              // at job.depth + 1. This fixes the prior cross-backend divergence.
              await txEngine.dispatch(event, { scopeId: jobScope, depth: job.depth })
            }
          })

          // Announced once its follow-up jobs are queued, so a listener that
          // re-reads on completion already sees them (e.g. a lecture's summary
          // job after its transcript).
          const completedJob = {
            ...job,
            status: 'completed' as const,
            output: result.output,
          }
          emit({ type: 'job:completed', jobRun: completedJob, result })
        } catch (err) {
          // The executor threw, or settling the run as completed did (that
          // rolled back, so the run is still claimed as running and none of
          // its follow-ups were queued). Either way the run failed: it is
          // marked so, and retried if it has retries left, which runs the
          // executor again. Should this step fail too, the error leaves
          // processOnce and the run stays running until the next start-up
          // marks it interrupted (server: failInterruptedJobs).
          const message = err instanceof Error ? err.message : String(err)
          // Retry decision lives in the core; backoff scheduling lives in the
          // adapter (server sets run_after via retryCount).
          const retryLimit = executors.getMeta(job.job_type)?.maxRetries ?? maxRetries
          // As above: the failure and its retry commit together.
          await settle(async (tx) => {
            await tx.updateJobRunStatus(job.id, 'failed', undefined, message)
            if (job.retry_count < retryLimit) {
              await tx.enqueueJobRun({
                workflowId: job.workflow_id,
                workflowJobId: job.workflow_job_id,
                jobType: job.job_type,
                input: job.input ?? {},
                depth: job.depth,
                retryCount: job.retry_count + 1,
              })
            }
          })
          const failedJob = { ...job, status: 'failed' as const, error: message }
          emit({ type: 'job:failed', jobRun: failedJob, error: message })
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
