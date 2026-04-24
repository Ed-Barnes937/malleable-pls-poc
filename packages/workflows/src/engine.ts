import type {
  DispatchResult,
  WorkflowEngine,
  WorkflowEngineConfig,
  WorkflowWithJobs,
} from './types'

const DEFAULT_MAX_DEPTH = 3

export function createWorkflowEngine(config: WorkflowEngineConfig): WorkflowEngine {
  const { store, maxDepth = DEFAULT_MAX_DEPTH } = config

  function matchesCondition(
    workflow: WorkflowWithJobs,
    payload: Record<string, unknown>,
  ): boolean {
    if (!workflow.condition_field || workflow.condition_value === null) {
      return true
    }
    return String(payload[workflow.condition_field]) === workflow.condition_value
  }

  function dispatch(
    eventType: string,
    payload: Record<string, unknown>,
    scopeId: string | null,
    depth = 0,
  ): DispatchResult {
    if (depth >= maxDepth) {
      return { enqueuedJobIds: [] }
    }

    const workflows = store.getEffectiveWorkflows(eventType, scopeId)
    const enqueuedJobIds: string[] = []

    for (const workflow of workflows) {
      if (!matchesCondition(workflow, payload)) continue

      for (const job of workflow.jobs) {
        const input = { ...payload, _delayMs: job.delay_ms }
        const runId = store.enqueueJobRun(
          workflow.id,
          job.id,
          job.job_type,
          input,
          depth + 1,
        )
        enqueuedJobIds.push(runId)
      }
    }

    return { enqueuedJobIds }
  }

  return { dispatch, matchesCondition }
}
