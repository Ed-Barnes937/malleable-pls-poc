import { query, exec } from '../db'
import type { Workflow, WorkflowJob, JobRun, WorkflowWithJobs } from '../types'

export function getWorkflowsForLens(sourceLens: string, workspaceId: string | null): WorkflowWithJobs[] {
  const workflows = query<Workflow>(
    `SELECT * FROM workflows
     WHERE source_lens = ?
     AND (workspace_id IS NULL OR workspace_id = ?)
     ORDER BY workspace_id IS NULL, trigger_event`,
    [sourceLens, workspaceId]
  )

  const grouped = new Map<string, WorkflowWithJobs>()

  for (const wf of workflows) {
    const key = `${wf.trigger_event}:${wf.condition_field ?? ''}:${wf.condition_value ?? ''}`
    const existing = grouped.get(key)
    if (!existing || wf.workspace_id !== null) {
      const jobs = query<WorkflowJob>(
        'SELECT * FROM workflow_jobs WHERE workflow_id = ? ORDER BY sort_order',
        [wf.id]
      )
      grouped.set(key, { ...wf, jobs })
    }
  }

  return Array.from(grouped.values())
}

export function getEffectiveWorkflows(
  triggerEvent: string,
  workspaceId: string | null
): WorkflowWithJobs[] {
  const workflows = query<Workflow>(
    `SELECT * FROM workflows
     WHERE trigger_event = ? AND enabled = 1
     AND (workspace_id IS NULL OR workspace_id = ?)`,
    [triggerEvent, workspaceId]
  )

  const grouped = new Map<string, Workflow>()
  for (const wf of workflows) {
    const key = `${wf.source_lens}:${wf.condition_field ?? ''}:${wf.condition_value ?? ''}`
    const existing = grouped.get(key)
    if (!existing || wf.workspace_id !== null) {
      grouped.set(key, wf)
    }
  }

  return Array.from(grouped.values()).map((wf) => {
    const jobs = query<WorkflowJob>(
      'SELECT * FROM workflow_jobs WHERE workflow_id = ? ORDER BY sort_order',
      [wf.id]
    )
    return { ...wf, jobs }
  })
}

export function enqueueJobRun(
  workflowId: string,
  workflowJobId: string,
  jobType: string,
  input: Record<string, unknown>,
  depth: number
): string {
  const id = crypto.randomUUID()
  exec(
    `INSERT INTO job_runs (id, workflow_id, workflow_job_id, job_type, status, input, depth, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [id, workflowId, workflowJobId, jobType, JSON.stringify(input), depth, new Date().toISOString()]
  )
  return id
}

export function getPendingJobRuns(): JobRun[] {
  return query<JobRun>(
    "SELECT * FROM job_runs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5"
  )
}

export function getRecentJobRuns(limit = 20): JobRun[] {
  return query<JobRun>(
    'SELECT * FROM job_runs ORDER BY created_at DESC LIMIT ?',
    [limit]
  )
}

export function getRunningJobCount(): number {
  const result = query<{ count: number }>(
    "SELECT COUNT(*) as count FROM job_runs WHERE status IN ('pending', 'running')"
  )
  return result[0]?.count ?? 0
}

export function updateJobRunStatus(
  id: string,
  status: 'running' | 'completed' | 'failed',
  output?: string,
  error?: string
): void {
  const now = new Date().toISOString()
  if (status === 'running') {
    exec('UPDATE job_runs SET status = ?, started_at = ? WHERE id = ?', [status, now, id])
  } else {
    exec(
      'UPDATE job_runs SET status = ?, output = ?, error = ?, completed_at = ? WHERE id = ?',
      [status, output ?? null, error ?? null, now, id]
    )
  }
}

export function setWorkflowEnabled(workflowId: string, enabled: boolean): void {
  exec('UPDATE workflows SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, workflowId])
}

export function createWorkspaceOverride(
  defaultWorkflow: WorkflowWithJobs,
  workspaceId: string
): string {
  const id = crypto.randomUUID()
  exec(
    `INSERT INTO workflows (id, source_lens, trigger_event, condition_field, condition_value, enabled, workspace_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      defaultWorkflow.source_lens,
      defaultWorkflow.trigger_event,
      defaultWorkflow.condition_field,
      defaultWorkflow.condition_value,
      defaultWorkflow.enabled,
      workspaceId,
      new Date().toISOString(),
    ]
  )
  for (const job of defaultWorkflow.jobs) {
    exec(
      `INSERT INTO workflow_jobs (id, workflow_id, job_type, params, sort_order, delay_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), id, job.job_type, job.params, job.sort_order, job.delay_ms]
    )
  }
  return id
}
