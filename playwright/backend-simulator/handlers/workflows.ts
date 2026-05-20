import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import type { WorkflowWithJobs } from '@pls/substrate/src/types'

export function registerWorkflowsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('workflows.forLens', (input) => {
    const { lensType, workspaceId } = input as { lensType: string; workspaceId: string }
    const matching = db.workflows.filter(
      (w) => w.source_lens === lensType && (w.workspace_id === null || w.workspace_id === workspaceId),
    )

    return matching
      .map((w): WorkflowWithJobs => ({
        ...w,
        jobs: db.workflowJobs
          .filter((j) => j.workflow_id === w.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  })

  router.register('workflows.toggle', (input) => {
    const { workflowId, enabled } = input as { workflowId: string; enabled: boolean }
    const wf = db.workflows.find((w) => w.id === workflowId)
    if (wf) wf.enabled = enabled ? 1 : 0
  })

  router.register('workflows.createOverride', (input) => {
    const { sourceWorkflowId, workspaceId, enabled } = input as {
      sourceWorkflowId: string; workspaceId: string; enabled: boolean
    }
    const source = db.workflows.find((w) => w.id === sourceWorkflowId)
    if (!source) return null

    const override = {
      id: `wf-${crypto.randomUUID().slice(0, 8)}`,
      source_lens: source.source_lens,
      trigger_event: source.trigger_event,
      condition_field: source.condition_field,
      condition_value: source.condition_value,
      enabled: enabled ? 1 : 0,
      workspace_id: workspaceId,
      created_at: new Date().toISOString(),
    }
    db.workflows.push(override)

    const sourceJobs = db.workflowJobs.filter((j) => j.workflow_id === sourceWorkflowId)
    for (const job of sourceJobs) {
      db.workflowJobs.push({
        id: `wfj-${crypto.randomUUID().slice(0, 8)}`,
        workflow_id: override.id,
        job_type: job.job_type,
        params: job.params,
        sort_order: job.sort_order,
        delay_ms: job.delay_ms,
      })
    }

    return override
  })

  router.register('workflows.dispatch', (input) => {
    const { eventType: _eventType, payload: _payload, workspaceId: _workspaceId } = input as {
      eventType: string; payload: Record<string, unknown>; workspaceId: string | null
    }
    return { enqueuedJobIds: [] }
  })
}
