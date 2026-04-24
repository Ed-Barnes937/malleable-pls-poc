import type { JobRunner, JobRunnerConfig, JobRunnerEvent } from './types'

const DEFAULT_INTERVAL_MS = 1000

export function createJobRunner(config: JobRunnerConfig): JobRunner {
  const { store, executors, engine, scopeId } = config

  let intervalHandle: ReturnType<typeof setInterval> | null = null
  let processing = false
  const listeners = new Set<(event: JobRunnerEvent) => void>()

  function emit(event: JobRunnerEvent) {
    for (const listener of listeners) {
      listener(event)
    }
  }

  async function processOnce(): Promise<void> {
    if (processing) return
    processing = true

    try {
      const pending = store.getPendingJobRuns()
      for (const job of pending) {
        store.updateJobRunStatus(job.id, 'running')
        const runningJob = { ...job, status: 'running' as const }
        emit({ type: 'job:started', jobRun: runningJob })

        try {
          const input = job.input ?? {}
          const result = await executors.execute(job.job_type, input)

          store.updateJobRunStatus(job.id, 'completed', result.output, undefined)
          const completedJob = { ...job, status: 'completed' as const, output: result.output }
          emit({ type: 'job:completed', jobRun: completedJob, result })

          if (result.events) {
            for (const event of result.events) {
              engine.dispatch(event.type, event.payload, scopeId, job.depth + 1)
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          store.updateJobRunStatus(job.id, 'failed', undefined, message)
          const failedJob = { ...job, status: 'failed' as const, error: message }
          emit({ type: 'job:failed', jobRun: failedJob, error: message })
        }
      }
    } finally {
      processing = false
    }
  }

  function start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
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

  function onEvent(listener: (event: JobRunnerEvent) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { start, stop, processOnce, isRunning, onEvent }
}
