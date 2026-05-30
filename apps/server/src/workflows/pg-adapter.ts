import type { TransactionSql } from 'postgres'
import type {
  EnqueueJobRunArgs,
  JobRun,
  JobStatus,
  StorageAdapter,
  WorkflowWithJobs,
} from '@pls/workflows'

/**
 * Per-transaction StorageAdapter for the postgres server runtime.
 *
 * The adapter closes over a `TransactionSql` and the owning `userId`: `userId`
 * is used for RLS (`set_config('app.current_user_id', ...)` is applied by the
 * caller opening the tx) and for `WHERE user_id = ...` scoping. `scopeId` on
 * the dispatch/runner side carries the `workspaceId` for override resolution.
 *
 * SQL is ported verbatim from the former `pg-store.ts`. jsonb columns mean the
 * driver handles (de)serialization, but `JSON.stringify` on insert/update is
 * preserved to match existing behaviour. `commit()` is intentionally omitted —
 * the surrounding `sql.begin` transaction auto-commits.
 */
export function createPgAdapter(opts: {
  sql: TransactionSql
  userId: string
}): StorageAdapter {
  const { sql, userId } = opts

  return {
    async getEffectiveWorkflows(triggerEvent, scopeId): Promise<WorkflowWithJobs[]> {
      const rows = await sql`
        SELECT w.id, w.source_lens, w.trigger_event, w.condition_field, w.condition_value, w.enabled,
               COALESCE(
                 json_agg(
                   json_build_object('id', wj.id, 'workflow_id', wj.workflow_id, 'job_type', wj.job_type,
                     'params', wj.params, 'sort_order', wj.sort_order, 'delay_ms', wj.delay_ms)
                   ORDER BY wj.sort_order
                 ) FILTER (WHERE wj.id IS NOT NULL),
                 '[]'
               ) AS jobs
        FROM workflows w
        LEFT JOIN workflow_jobs wj ON wj.workflow_id = w.id
        WHERE w.trigger_event = ${triggerEvent}
          AND w.enabled = true
          AND w.user_id = ${userId}
          AND (w.workspace_id IS NULL OR w.workspace_id = ${scopeId})
        GROUP BY w.id
      `
      return rows as unknown as WorkflowWithJobs[]
    },

    async enqueueJobRun(args: EnqueueJobRunArgs): Promise<string> {
      const retryCount = args.retryCount ?? 0
      // Backoff lives here (the core owns only the retry DECISION via maxRetries):
      // run_after = now() + (2 ^ retryCount) * 1000ms, capped at 60s.
      const backoffMs = retryCount > 0 ? Math.min(2 ** retryCount * 1000, 60000) : 0
      // Persist the owning user in the input so executors (which open their own
      // RLS-scoped tx via withUser) can recover it when the job is claimed.
      const input = { ...args.input, _userId: userId }
      const [row] = await sql`
        INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, input, depth, retry_count, run_after)
        VALUES (${userId}, ${args.workflowId}, ${args.workflowJobId}, ${args.jobType}, ${JSON.stringify(input)}, ${args.depth}, ${retryCount}, now() + ${backoffMs + 'ms'}::interval)
        RETURNING id
      `
      return (row as { id: string }).id
    },

    async claimPendingJobRuns(): Promise<JobRun[]> {
      const rows = await sql`
        SELECT id, workflow_id, workflow_job_id, job_type, status, input, output, error, depth, retry_count,
               created_at, started_at, completed_at
        FROM job_runs
        WHERE user_id = ${userId} AND status = 'pending' AND run_after <= now()
        ORDER BY created_at ASC
        LIMIT 5
      `
      return rows as unknown as JobRun[]
    },

    async updateJobRunStatus(
      id: string,
      status: JobStatus,
      output?: Record<string, unknown>,
      error?: string,
    ): Promise<void> {
      if (status === 'running') {
        await sql`UPDATE job_runs SET status = 'running', started_at = now() WHERE id = ${id}`
      } else if (status === 'completed') {
        await sql`UPDATE job_runs SET status = 'completed', output = ${output ? JSON.stringify(output) : null}, completed_at = now() WHERE id = ${id}`
      } else if (status === 'failed') {
        await sql`UPDATE job_runs SET status = 'failed', error = ${error ?? null}, completed_at = now() WHERE id = ${id}`
      }
    },
  }
}
