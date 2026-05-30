import type {
  DispatchContext,
  DispatchResult,
  WorkflowEngine,
  WorkflowEngineConfig,
  WorkflowEvent,
  WorkflowWithJobs,
} from './types'

const DEFAULT_MAX_DEPTH = 3

export function createWorkflowEngine(config: WorkflowEngineConfig): WorkflowEngine {
  const { adapter, maxDepth = DEFAULT_MAX_DEPTH } = config

  function matchesCondition(
    workflow: WorkflowWithJobs,
    payload: Record<string, unknown>,
  ): boolean {
    if (!workflow.condition_field || workflow.condition_value === null) {
      return true
    }
    return String(payload[workflow.condition_field]) === workflow.condition_value
  }

  async function dispatch(
    event: WorkflowEvent,
    ctx: DispatchContext,
  ): Promise<DispatchResult> {
    const depth = ctx.depth ?? 0
    if (depth >= maxDepth) {
      return { enqueuedJobIds: [] }
    }

    const workflows = await adapter.getEffectiveWorkflows(event.type, ctx.scopeId)
    const enqueuedJobIds: string[] = []

    for (const workflow of workflows) {
      if (!matchesCondition(workflow, event.payload)) continue

      // jobs are pre-sorted by sort_order by the adapter.
      for (const job of workflow.jobs) {
        const input = { ...event.payload, _delayMs: job.delay_ms }

        // Substrate-only opt-in dedup.
        if (adapter.isDuplicate && (await adapter.isDuplicate(job.job_type, input))) {
          continue
        }

        const runId = await adapter.enqueueJobRun({
          workflowId: workflow.id,
          workflowJobId: job.id,
          jobType: job.job_type,
          input,
          // The engine adds +1 on enqueue; callers cascade at job.depth.
          depth: depth + 1,
        })
        enqueuedJobIds.push(runId)
      }
    }

    if (adapter.commit && enqueuedJobIds.length > 0) {
      await adapter.commit()
    }

    return { enqueuedJobIds }
  }

  return { dispatch, matchesCondition }
}
