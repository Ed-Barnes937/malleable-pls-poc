import type { TransactionSql } from 'postgres'
import type { Sql } from '@pls/db'
import type {
  EnqueueJobRunArgs,
  JobRun,
  JobStatus,
  StorageAdapter,
  WorkflowWithJobs,
} from '@pls/workflows'
import { workflowJobsJson } from './sql'

/**
 * Per-operation StorageAdapter for the postgres server runtime.
 *
 * Two modes selected by the shape of `opts`:
 *
 * - `{ tx, userId }` — dispatch path. Uses the caller's `TransactionSql`
 *   directly; `set_config` is the caller's responsibility (e.g. via `withUser`).
 *   `getEffectiveWorkflows` + `enqueueJobRun` run inside the caller's tx so
 *   the enqueue is atomic with the event that triggered it.
 *
 * - `{ sql, userId }` — runner path. Each adapter method manages its own short
 *   `sql.begin` + `set_config`, so no long-lived connection is held across
 *   executor I/O. Use this when constructing the adapter for the job runner.
 */
type PgAdapterOpts =
  | { tx: TransactionSql; userId: string }
  | { sql: Sql; userId: string }

export function createPgAdapter(opts: PgAdapterOpts): StorageAdapter {
  const { userId } = opts

  async function withDb<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    if ('tx' in opts) {
      return fn(opts.tx)
    }
    return opts.sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${userId}, true)`
      return fn(tx)
    }) as Promise<T>
  }

  return {
    /**
     * Returns workflows matching `triggerEvent` with override resolution:
     * when both a default (workspace_id IS NULL) and a workspace override exist
     * for the same (source_lens, condition_field, condition_value), the override
     * wins and only one row is returned. Implemented via DISTINCT ON with
     * workspace_id NULLS LAST ordering.
     */
    async getEffectiveWorkflows(triggerEvent, scopeId): Promise<WorkflowWithJobs[]> {
      return withDb(async (tx) => {
        const rows = await tx`
          WITH deduped AS (
            SELECT DISTINCT ON (source_lens, condition_field, condition_value) id
            FROM workflows
            WHERE trigger_event = ${triggerEvent}
              AND enabled = true
              AND user_id = ${userId}
              AND (workspace_id IS NULL OR workspace_id = ${scopeId})
            ORDER BY source_lens, condition_field, condition_value, workspace_id NULLS LAST
          )
          SELECT w.id, w.source_lens, w.trigger_event, w.condition_field, w.condition_value, w.enabled,
                 ${workflowJobsJson(tx)} AS jobs
          FROM deduped
          JOIN workflows w ON w.id = deduped.id
          LEFT JOIN workflow_jobs wj ON wj.workflow_id = w.id
          GROUP BY w.id
        `
        return rows as unknown as WorkflowWithJobs[]
      })
    },

    async enqueueJobRun(args: EnqueueJobRunArgs): Promise<string> {
      return withDb(async (tx) => {
        const retryCount = args.retryCount ?? 0
        // Backoff lives here (the core owns only the retry DECISION via maxRetries):
        // run_after = now() + (2 ^ retryCount) * 1000ms, capped at 60s.
        const backoffMs = retryCount > 0 ? Math.min(2 ** retryCount * 1000, 60000) : 0
        // Persist the owning user in the input so executors (which open their own
        // RLS-scoped tx via withUser) can recover it when the job is claimed.
        const input = { ...args.input, _userId: userId }
        const [row] = await tx`
          INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, input, depth, retry_count, run_after)
          VALUES (${userId}, ${args.workflowId}, ${args.workflowJobId}, ${args.jobType}, ${JSON.stringify(input)}, ${args.depth}, ${retryCount}, now() + ${backoffMs + 'ms'}::interval)
          RETURNING id
        `
        return (row as { id: string }).id
      })
    },

    /**
     * Atomically claims pending jobs by flipping their status to 'running' in a
     * single UPDATE … FOR UPDATE SKIP LOCKED. This prevents concurrent workers
     * or overlapping poll ticks from claiming the same job twice.
     * Returned rows already have status='running'.
     */
    async claimPendingJobRuns(): Promise<JobRun[]> {
      return withDb(async (tx) => {
        const rows = await tx`
          UPDATE job_runs SET status = 'running', started_at = now()
          WHERE id IN (
            SELECT id FROM job_runs
            WHERE user_id = ${userId} AND status = 'pending' AND run_after <= now()
            ORDER BY created_at ASC
            LIMIT 5
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, workflow_id, workflow_job_id, job_type, status, input, output, error, depth, retry_count,
                    created_at, started_at, completed_at
        `
        return rows as unknown as JobRun[]
      })
    },

    async updateJobRunStatus(
      id: string,
      status: JobStatus,
      output?: Record<string, unknown>,
      error?: string,
    ): Promise<void> {
      return withDb(async (tx) => {
        if (status === 'running') {
          await tx`UPDATE job_runs SET status = 'running', started_at = now() WHERE id = ${id}`
        } else if (status === 'completed') {
          await tx`UPDATE job_runs SET status = 'completed', output = ${output ? JSON.stringify(output) : null}, completed_at = now() WHERE id = ${id}`
        } else if (status === 'failed') {
          await tx`UPDATE job_runs SET status = 'failed', error = ${error ?? null}, completed_at = now() WHERE id = ${id}`
        }
      })
    },
  }
}
