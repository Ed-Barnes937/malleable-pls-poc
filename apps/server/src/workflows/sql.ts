import type { TransactionSql } from 'postgres'

export interface WorkflowJobInput {
  jobType: string
  params?: Record<string, unknown>
  sortOrder: number
  delayMs?: number
}

/**
 * `jobs` column projection: aggregates workflow_jobs rows (aliased `wj`) into
 * a json array ordered by sort_order. Embed inside a query that LEFT JOINs
 * `workflow_jobs wj` and GROUPs BY the workflow id.
 */
export function workflowJobsJson(tx: TransactionSql) {
  return tx`COALESCE(
    json_agg(
      json_build_object('id', wj.id, 'workflow_id', wj.workflow_id, 'job_type', wj.job_type,
        'params', wj.params, 'sort_order', wj.sort_order, 'delay_ms', wj.delay_ms)
      ORDER BY wj.sort_order
    ) FILTER (WHERE wj.id IS NOT NULL),
    '[]'
  )`
}

export async function insertWorkflowJob(
  tx: TransactionSql,
  userId: string,
  workflowId: string,
  job: WorkflowJobInput,
): Promise<void> {
  await tx`
    INSERT INTO workflow_jobs (user_id, workflow_id, job_type, params, sort_order, delay_ms)
    VALUES (${userId}, ${workflowId}, ${job.jobType}, ${JSON.stringify(job.params ?? {})},
            ${job.sortOrder}, ${job.delayMs ?? 0})
  `
}
