import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb, Workflow, WorkflowJob } from '../in-memory-db'

type WorkflowWithJobs = Workflow & { jobs: WorkflowJob[] }

/** As on the server: a board copy replaces the built-in automation it was made from. */
function effectiveOnBoard(workflows: Workflow[], workspaceId: string): Workflow[] {
  const key = (w: Workflow) => [w.trigger_event, w.source_lens, w.condition_field, w.condition_value].join('\u0000')
  const onBoard = new Set(workflows.filter((w) => w.workspace_id === workspaceId).map(key))
  return workflows.filter((w) =>
    w.workspace_id === workspaceId || (w.workspace_id === null && !onBoard.has(key(w))))
}

export function registerWorkflowsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('workflows.forLens', (input) => {
    const { lensType, workspaceId } = input as { lensType: string; workspaceId: string }
    const matching = effectiveOnBoard(db.workflows, workspaceId).filter((w) => w.source_lens === lensType)

    return matching
      .map((w): WorkflowWithJobs => ({
        ...w,
        jobs: db.workflowJobs
          .filter((j) => j.workflow_id === w.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  })

  router.register('workflows.byId', (input) => {
    const workflow = db.workflows.find((w) => w.id === (input as string))
    if (!workflow) return null
    return {
      ...workflow,
      jobs: db.workflowJobs.filter((j) => j.workflow_id === workflow.id).sort((a, b) => a.sort_order - b.sort_order),
    }
  })

  router.register('workflows.forWorkspace', (input) => {
    const { workspaceId } = input as { workspaceId: string }
    const matching = effectiveOnBoard(db.workflows, workspaceId)

    return matching
      .map((w): WorkflowWithJobs => ({
        ...w,
        jobs: db.workflowJobs
          .filter((j) => j.workflow_id === w.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  })

  router.register('workflows.create', (input) => {
    const { workspaceId, sourceLens, triggerEvent, conditionField, conditionValue, enabled, jobs } =
      input as {
        workspaceId: string | null
        sourceLens: string
        triggerEvent: string
        conditionField?: string | null
        conditionValue?: string | null
        enabled?: boolean
        jobs: { jobType: string; params?: Record<string, unknown>; sortOrder: number; delayMs?: number }[]
      }

    const workflow = {
      id: `wf-${crypto.randomUUID().slice(0, 8)}`,
      source_lens: sourceLens,
      trigger_event: triggerEvent,
      condition_field: conditionField ?? null,
      condition_value: conditionValue ?? null,
      enabled: enabled === false ? 0 : 1,
      workspace_id: workspaceId,
      created_at: new Date().toISOString(),
    }
    db.workflows.push(workflow)

    for (const job of jobs) {
      db.workflowJobs.push({
        id: `wfj-${crypto.randomUUID().slice(0, 8)}`,
        workflow_id: workflow.id,
        job_type: job.jobType,
        params: JSON.stringify(job.params ?? {}),
        sort_order: job.sortOrder,
        delay_ms: job.delayMs ?? 0,
      })
    }

    return workflow
  })

  router.register('workflows.update', (input) => {
    const { workflowId, triggerEvent, conditionField, conditionValue, enabled, jobs } = input as {
      workflowId: string
      triggerEvent: string
      conditionField?: string | null
      conditionValue?: string | null
      enabled: boolean
      jobs: { jobType: string; params?: Record<string, unknown>; sortOrder: number; delayMs?: number }[]
    }

    const workflow = db.workflows.find((w) => w.id === workflowId)
    if (!workflow) return null

    workflow.trigger_event = triggerEvent
    workflow.condition_field = conditionField ?? null
    workflow.condition_value = conditionValue ?? null
    workflow.enabled = enabled ? 1 : 0

    db.workflowJobs = db.workflowJobs.filter((j) => j.workflow_id !== workflowId)
    for (const job of jobs) {
      db.workflowJobs.push({
        id: `wfj-${crypto.randomUUID().slice(0, 8)}`,
        workflow_id: workflowId,
        job_type: job.jobType,
        params: JSON.stringify(job.params ?? {}),
        sort_order: job.sortOrder,
        delay_ms: job.delayMs ?? 0,
      })
    }

    return workflow
  })

  // In-place edit. Unlike the server it does not re-place reviews (no
  // scheduler or plan item writes here), so it always reports none moved.
  router.register('workflows.patch', (input) => {
    const { workflowId, conditionValue, jobParams } = input as {
      workflowId: string
      conditionValue?: string
      jobParams?: { workflowJobId: string; params: Record<string, unknown> }[]
    }
    const workflow = db.workflows.find((w) => w.id === workflowId)
    if (!workflow) throw new Error('Automation not found')
    if (conditionValue !== undefined) workflow.condition_value = conditionValue
    for (const { workflowJobId, params } of jobParams ?? []) {
      const job = db.workflowJobs.find((j) => j.id === workflowJobId && j.workflow_id === workflowId)
      if (!job) throw new Error('Automation step not found')
      job.params = JSON.stringify(params)
    }
    return { reviews: { moved: 0, unscheduled: 0 } }
  })

  router.register('workflows.delete', (input) => {
    const { workflowId } = input as { workflowId: string }
    db.workflows = db.workflows.filter((w) => w.id !== workflowId)
    db.workflowJobs = db.workflowJobs.filter((j) => j.workflow_id !== workflowId)
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
