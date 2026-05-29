import type {
  EnqueueJobRunArgs,
  JobRun,
  JobStatus,
  StorageAdapter,
  WorkflowWithJobs,
} from '../types'

export interface MemoryAdapterSeed {
  /** Keyed by trigger event, optionally scoped (`${triggerEvent}::${scopeId}`). */
  workflows?: WorkflowWithJobs[]
  /** Limit returned per claim tick. Defaults to 5 (matches sql.js). */
  batchSize?: number
}

export interface MemoryAdapter extends StorageAdapter {
  /** All job runs ever created, in insertion order. Useful for assertions. */
  readonly jobRuns: JobRun[]
}

/**
 * A tiny synchronous in-memory {@link StorageAdapter}. Proves the interface is
 * satisfiable without any DB and keeps test fakes out of each test file.
 *
 * Because every method returns a plain (sync) value, it also demonstrates that
 * a synchronous adapter satisfies the `Awaitable<T>` contract.
 */
export function createMemoryAdapter(seed: MemoryAdapterSeed = {}): MemoryAdapter {
  const workflows = seed.workflows ?? []
  const batchSize = seed.batchSize ?? 5
  const runs: JobRun[] = []
  let idCounter = 0

  function newId(): string {
    idCounter += 1
    return `run-${idCounter}`
  }

  const adapter: MemoryAdapter = {
    get jobRuns() {
      return runs
    },

    getEffectiveWorkflows(triggerEvent: string, _scopeId: string | null) {
      return workflows.filter((w) => w.trigger_event === triggerEvent && w.enabled)
    },

    enqueueJobRun(args: EnqueueJobRunArgs): string {
      const id = newId()
      runs.push({
        id,
        workflow_id: args.workflowId,
        workflow_job_id: args.workflowJobId,
        job_type: args.jobType,
        status: 'pending',
        input: args.input,
        output: null,
        error: null,
        depth: args.depth,
        retry_count: args.retryCount ?? 0,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      })
      return id
    },

    claimPendingJobRuns(): JobRun[] {
      return runs.filter((r) => r.status === 'pending').slice(0, batchSize)
    },

    updateJobRunStatus(
      id: string,
      status: JobStatus,
      output?: Record<string, unknown>,
      error?: string,
    ): void {
      const run = runs.find((r) => r.id === id)
      if (!run) return
      run.status = status
      if (output !== undefined) run.output = output
      if (error !== undefined) run.error = error
      if (status === 'running') run.started_at = new Date().toISOString()
      if (status === 'completed' || status === 'failed') {
        run.completed_at = new Date().toISOString()
      }
    },
  }

  return adapter
}
