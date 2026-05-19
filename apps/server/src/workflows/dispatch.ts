import type { TransactionSql } from 'postgres'
import { createPgWorkflowStore } from './pg-store'

const MAX_DEPTH = 3
const store = createPgWorkflowStore()

export async function dispatchWorkflows(
  tx: TransactionSql,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
  workspaceId: string | null,
  depth = 0,
): Promise<string[]> {
  if (depth >= MAX_DEPTH) return []

  const workflows = await store.getEffectiveWorkflows(tx, userId, eventType, workspaceId)
  const enqueuedIds: string[] = []

  for (const workflow of workflows) {
    if (workflow.condition_field && workflow.condition_value !== null) {
      if (String(payload[workflow.condition_field]) !== workflow.condition_value) continue
    }

    for (const job of workflow.jobs) {
      const input = { ...payload, _delayMs: job.delay_ms }
      const id = await store.enqueueJobRun(tx, userId, workflow.id, job.id, job.job_type, input, depth + 1)
      enqueuedIds.push(id)
    }
  }

  return enqueuedIds
}
