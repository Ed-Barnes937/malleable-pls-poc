import type {
  EnqueueJobRunArgs,
  JobRun as CoreJobRun,
  JobStatus,
  StorageAdapter,
  WorkflowWithJobs as CoreWorkflowWithJobs,
} from '@pls/workflows'
import {
  getEffectiveWorkflows,
  enqueueJobRun,
  getPendingJobRuns,
  updateJobRunStatus,
} from '../queries/workflows'
import { persistDb } from '../db'
import type { JobRun } from '../types'

/**
 * Maps a substrate (sql.js TEXT-column) `JobRun` row to the core `JobRun`,
 * JSON-decoding the `input`/`output` TEXT columns and supplying the
 * `retry_count` the core expects (substrate has no such column, so it is
 * always 0 — `maxRetries=0` means it is never read).
 */
function toCoreJobRun(run: JobRun): CoreJobRun {
  return {
    id: run.id,
    workflow_id: run.workflow_id,
    workflow_job_id: run.workflow_job_id,
    job_type: run.job_type,
    status: run.status,
    input: run.input ? (JSON.parse(run.input) as Record<string, unknown>) : null,
    output: run.output ? (JSON.parse(run.output) as Record<string, unknown>) : null,
    error: run.error,
    depth: run.depth,
    retry_count: 0,
    created_at: run.created_at,
    started_at: run.started_at,
    completed_at: run.completed_at,
  }
}

/**
 * Maps a substrate workflow row (`enabled: number`, `params: string`) to the
 * core `WorkflowWithJobs` shape (`enabled: boolean`, `params` decoded).
 */
function toCoreWorkflow(wf: ReturnType<typeof getEffectiveWorkflows>[number]): CoreWorkflowWithJobs {
  return {
    id: wf.id,
    source_lens: wf.source_lens,
    trigger_event: wf.trigger_event,
    condition_field: wf.condition_field,
    condition_value: wf.condition_value,
    enabled: Boolean(wf.enabled),
    jobs: wf.jobs.map((job) => ({
      id: job.id,
      workflow_id: job.workflow_id,
      job_type: job.job_type,
      params: job.params ? (JSON.parse(job.params) as Record<string, unknown>) : {},
      sort_order: job.sort_order,
      delay_ms: job.delay_ms,
    })),
  }
}

/**
 * A synchronous {@link StorageAdapter} backed by sql.js, delegating to the
 * existing `queries/workflows.ts` functions. `scopeId` is the opaque
 * workspace id substrate already uses.
 *
 * Synchronous returns satisfy the core's `Awaitable<T>` contract directly.
 */
export function createSqlJsAdapter(): StorageAdapter {
  return {
    getEffectiveWorkflows(triggerEvent: string, scopeId: string | null) {
      return getEffectiveWorkflows(triggerEvent, scopeId).map(toCoreWorkflow)
    },

    enqueueJobRun(args: EnqueueJobRunArgs): string {
      return enqueueJobRun(
        args.workflowId,
        args.workflowJobId,
        args.jobType,
        args.input,
        args.depth,
      )
    },

    claimPendingJobRuns(): CoreJobRun[] {
      // Plain SELECT (status='pending' LIMIT 5) — no atomic locking.
      return getPendingJobRuns().map(toCoreJobRun)
    },

    updateJobRunStatus(
      id: string,
      status: JobStatus,
      output?: Record<string, unknown>,
      error?: string,
    ): void {
      // sql.js stores output as TEXT; serialize here.
      updateJobRunStatus(
        id,
        status as 'running' | 'completed' | 'failed',
        output !== undefined ? JSON.stringify(output) : undefined,
        error,
      )
    },

    isDuplicate(jobType: string, input: Record<string, unknown>): boolean {
      const pending = getPendingJobRuns()
      const inputKey = JSON.stringify({ jobType, target: input.target_id })
      return pending.some((run) => {
        const runKey = JSON.stringify({
          jobType: run.job_type,
          target: run.input ? (JSON.parse(run.input) as { target_id?: unknown }).target_id : null,
        })
        return runKey === inputKey
      })
    },

    commit(): void {
      persistDb()
    },
  }
}
