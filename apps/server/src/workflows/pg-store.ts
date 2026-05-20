import type { TransactionSql } from 'postgres'

export interface PgWorkflowStore {
  getEffectiveWorkflows(tx: TransactionSql, userId: string, triggerEvent: string, workspaceId: string | null): Promise<WorkflowWithJobs[]>
  getPendingJobRuns(tx: TransactionSql, userId: string): Promise<JobRun[]>
  enqueueJobRun(tx: TransactionSql, userId: string, workflowId: string, workflowJobId: string, jobType: string, input: Record<string, unknown>, depth: number, retryCount?: number): Promise<string>
  updateJobRunStatus(tx: TransactionSql, id: string, status: string, output?: Record<string, unknown>, error?: string): Promise<void>
}

interface WorkflowWithJobs {
  id: string
  source_lens: string
  trigger_event: string
  condition_field: string | null
  condition_value: string | null
  enabled: boolean
  jobs: { id: string; workflow_id: string; job_type: string; params: Record<string, unknown>; sort_order: number; delay_ms: number }[]
}

interface JobRun {
  id: string
  workflow_id: string
  workflow_job_id: string
  job_type: string
  status: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  depth: number
  retry_count: number
}

export function createPgWorkflowStore(): PgWorkflowStore {
  return {
    async getEffectiveWorkflows(tx, userId, triggerEvent, workspaceId) {
      const rows = await tx`
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
          AND (w.workspace_id IS NULL OR w.workspace_id = ${workspaceId})
        GROUP BY w.id
      `
      return rows as unknown as WorkflowWithJobs[]
    },

    async getPendingJobRuns(tx, userId) {
      const rows = await tx`
        SELECT id, workflow_id, workflow_job_id, job_type, status, input, output, error, depth, retry_count
        FROM job_runs
        WHERE user_id = ${userId} AND status = 'pending' AND run_after <= now()
        ORDER BY created_at ASC
        LIMIT 5
      `
      return rows as unknown as JobRun[]
    },

    async enqueueJobRun(tx, userId, workflowId, workflowJobId, jobType, input, depth, retryCount = 0) {
      const backoffMs = retryCount > 0 ? Math.min(2 ** retryCount * 1000, 60000) : 0
      const [row] = await tx`
        INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, input, depth, retry_count, run_after)
        VALUES (${userId}, ${workflowId}, ${workflowJobId}, ${jobType}, ${JSON.stringify(input)}, ${depth}, ${retryCount}, now() + ${backoffMs + 'ms'}::interval)
        RETURNING id
      `
      return (row as { id: string }).id
    },

    async updateJobRunStatus(tx, id, status, output, error) {
      if (status === 'running') {
        await tx`UPDATE job_runs SET status = 'running', started_at = now() WHERE id = ${id}`
      } else if (status === 'completed') {
        await tx`UPDATE job_runs SET status = 'completed', output = ${output ? JSON.stringify(output) : null}, completed_at = now() WHERE id = ${id}`
      } else if (status === 'failed') {
        await tx`UPDATE job_runs SET status = 'failed', error = ${error ?? null}, completed_at = now() WHERE id = ${id}`
      }
    },
  }
}
