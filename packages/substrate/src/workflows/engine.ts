import { getEffectiveWorkflows, enqueueJobRun, getPendingJobRuns } from '../queries/workflows'
import { persistDb } from '../db'
import type { WorkflowWithJobs } from '../types'

const MAX_WORKFLOW_DEPTH = 3

export function matchesCondition(
  workflow: WorkflowWithJobs,
  payload: Record<string, unknown>
): boolean {
  if (!workflow.condition_field || !workflow.condition_value) return true
  return String(payload[workflow.condition_field]) === workflow.condition_value
}

function isDuplicate(jobType: string, input: Record<string, unknown>): boolean {
  const pending = getPendingJobRuns()
  const inputKey = JSON.stringify({ jobType, target: input.target_id })
  return pending.some((run) => {
    const runKey = JSON.stringify({ jobType: run.job_type, target: run.input ? JSON.parse(run.input).target_id : null })
    return runKey === inputKey
  })
}

export function dispatchWorkflows(
  eventType: string,
  payload: Record<string, unknown>,
  workspaceId: string | null,
  depth: number
): string[] {
  if (depth >= MAX_WORKFLOW_DEPTH) return []

  const workflows = getEffectiveWorkflows(eventType, workspaceId)
  const enqueuedIds: string[] = []

  for (const workflow of workflows) {
    if (!matchesCondition(workflow, payload)) continue

    for (const job of workflow.jobs) {
      const input = { ...payload, _delayMs: job.delay_ms }
      if (isDuplicate(job.job_type, input)) continue

      const id = enqueueJobRun(
        workflow.id,
        job.id,
        job.job_type,
        input,
        depth + 1,
      )
      enqueuedIds.push(id)
    }
  }

  if (enqueuedIds.length > 0) {
    persistDb()
  }

  return enqueuedIds
}
