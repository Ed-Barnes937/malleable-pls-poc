import { trpc } from './trpc'
import type { Scope, ScopeDim } from '@pls/lens-framework'
import type { UseQueryResult } from '@tanstack/react-query'
import type { WorkflowWithJobs, JobRun } from '@pls/workflows'
import type { PlanItemQuery } from '@pls/substrate'

type ScopeRow = { scope_type: string; scope_value: string }

/** `workspace_scopes.scope_type` for each Scope dimension. */
export const SCOPE_TYPE_BY_DIM: Record<ScopeDim, 'tag' | 'recording'> = {
  courseTag: 'tag',
  recordingId: 'recording',
}

/** Convert raw DB scope rows into the Scope domain object used by lens components. */
export function decodeScope(rows: ScopeRow[]): Scope {
  const scope: Scope = {}
  for (const s of rows) {
    if (s.scope_type === SCOPE_TYPE_BY_DIM.courseTag) scope.courseTag = s.scope_value
    if (s.scope_type === SCOPE_TYPE_BY_DIM.recordingId) scope.recordingId = s.scope_value
  }
  return scope
}

export function useWorkspaces() {
  return trpc.workspaces.list.useQuery()
}

export function useWorkspacePanels(workspaceId: string) {
  return trpc.workspaces.panels.useQuery(workspaceId)
}

export function useWorkspaceScopes(workspaceId: string) {
  return trpc.workspaces.scopes.useQuery(workspaceId)
}

export function useCreateWorkspace() {
  const utils = trpc.useUtils()
  return trpc.workspaces.create.useMutation({
    onSuccess: () => utils.workspaces.list.invalidate(),
  })
}

export function useDeleteWorkspace() {
  const utils = trpc.useUtils()
  return trpc.workspaces.delete.useMutation({
    onSuccess: () => utils.workspaces.list.invalidate(),
  })
}

export function useReorderWorkspaces() {
  const utils = trpc.useUtils()
  return trpc.workspaces.reorder.useMutation({
    onMutate: async (ids) => {
      await utils.workspaces.list.cancel()
      const prev = utils.workspaces.list.getData()
      if (prev) {
        const byId = new Map(prev.map((w) => [w.id as string, w]))
        const reordered = ids
          .map((id) => byId.get(id))
          .filter(Boolean) as typeof prev
        utils.workspaces.list.setData(undefined, reordered)
      }
      return { prev }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) utils.workspaces.list.setData(undefined, ctx.prev)
    },
    onSettled: () => utils.workspaces.list.invalidate(),
  })
}

export function useAddWorkspacePanel() {
  const utils = trpc.useUtils()
  return trpc.workspaces.addPanel.useMutation({
    onSuccess: () => utils.workspaces.panels.invalidate(),
  })
}

export function useRemoveWorkspacePanel() {
  const utils = trpc.useUtils()
  return trpc.workspaces.removePanel.useMutation({
    onSuccess: () => utils.workspaces.panels.invalidate(),
  })
}

export function useUpdatePanelLayouts() {
  return trpc.workspaces.updateLayouts.useMutation()
}

export function useUpdatePanelConfig() {
  const utils = trpc.useUtils()
  return trpc.workspaces.updatePanelConfig.useMutation({
    onSuccess: () => utils.workspaces.panels.invalidate(),
  })
}

export function useUpdateWorkspaceBackground() {
  const utils = trpc.useUtils()
  return trpc.workspaces.updateBackground.useMutation({
    onSuccess: () => utils.workspaces.list.invalidate(),
  })
}

export function useSetWorkspaceScope() {
  const utils = trpc.useUtils()
  return trpc.workspaces.setScope.useMutation({
    onSuccess: (_data, input) => {
      utils.workspaces.scopes.invalidate()
      // A freshly captured/uploaded recording becomes the focus before any
      // job event has refreshed the recordings list the focus picker reads.
      if (input.scopeType === SCOPE_TYPE_BY_DIM.recordingId) utils.recordings.invalidate()
    },
  })
}

export function useRecordings(courseTag?: string) {
  return trpc.recordings.list.useQuery(courseTag ? { courseTag } : undefined)
}

/**
 * The board's focused recording, looked up by id rather than through the
 * course-narrowed list: focus and course may disagree, and the picker and
 * chip must still name the focused lecture.
 */
export function useFocusedRecording(recordingId: string | undefined) {
  return trpc.recordings.byId.useQuery(recordingId ?? '', { enabled: !!recordingId })
}

/**
 * Plan items for shell chrome (the top bar's today line), outside any widget.
 * Shares the `planItems` cache, so every plan item change refreshes it.
 */
export function usePlanItemList(query: PlanItemQuery) {
  return trpc.planItems.list.useQuery(query)
}

export function useRecentJobs(limit?: number): UseQueryResult<JobRun[]> {
  return trpc.jobs.recent.useQuery(limit) as unknown as UseQueryResult<JobRun[]>
}

/** Re-queue a failed job run (see jobs.recent `retryable`). */
export function useRetryJob() {
  const utils = trpc.useUtils()
  return trpc.jobs.retry.useMutation({
    onSuccess: () => {
      utils.jobs.recent.invalidate()
      utils.jobs.runningCount.invalidate()
    },
  })
}

export function useRunningJobCount() {
  return trpc.jobs.runningCount.useQuery(undefined, { refetchInterval: 3000 })
}

export function useWorkflowsForLens(lensType: string, workspaceId: string): UseQueryResult<WorkflowWithJobs[]> {
  return trpc.workflows.forLens.useQuery({ lensType, workspaceId }) as unknown as UseQueryResult<WorkflowWithJobs[]>
}

export function useWorkflowsForWorkspace(workspaceId: string): UseQueryResult<WorkflowWithJobs[]> {
  return trpc.workflows.forWorkspace.useQuery({ workspaceId }) as unknown as UseQueryResult<WorkflowWithJobs[]>
}

function invalidateWorkflows(utils: ReturnType<typeof trpc.useUtils>) {
  utils.workflows.forLens.invalidate()
  utils.workflows.forWorkspace.invalidate()
}

export function useToggleWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.toggle.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export function useCreateWorkspaceOverride() {
  const utils = trpc.useUtils()
  return trpc.workflows.createOverride.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export function useCreateWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.create.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export function useUpdateWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.update.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

/**
 * Edits an automation in place (condition value, job params). Editing the
 * confusion automation re-places its reviews on the server, so plan items
 * refresh too.
 */
export function usePatchWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.patch.useMutation({
    onSuccess: () => {
      invalidateWorkflows(utils)
      utils.planItems.invalidate()
    },
  })
}

export function useDeleteWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.delete.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export interface JobEvent {
  type: 'job:started' | 'job:completed' | 'job:failed' | 'data:changed'
  jobType?: string
  /** job:failed only - true when the server will retry automatically. */
  willRetry?: boolean
  /** job:completed only - nothing changed worth a toast (e.g. a moment marked twice). */
  quiet?: boolean
}

export interface ServerEventHandlers {
  onJobStarted?: (event: JobEvent) => void
  onJobCompleted?: (event: JobEvent) => void
  onJobFailed?: (event: JobEvent) => void
}

export function useServerEvents(handlers?: ServerEventHandlers) {
  const utils = trpc.useUtils()
  /**
   * Everything a job may have written. A failed run too: it can fail after
   * writing (e.g. while cascading), and a lecture's `processing` ends with it.
   */
  const refreshJobData = () => {
    utils.recordings.invalidate()
    utils.transcripts.invalidate()
    utils.tags.invalidate()
    utils.links.invalidate()
    utils.confidence.invalidate()
    utils.aggregates.invalidate()
    utils.annotations.invalidate()
    utils.planItems.invalidate()
  }
  return trpc.events.onDataChange.useSubscription(undefined, {
    onError: () => {},
    onData: (event) => {
      utils.jobs.recent.invalidate()
      utils.jobs.runningCount.invalidate()
      if (event.type === 'job:started') {
        // A lecture's `processing` follows its jobs (e.g. its summary starting).
        utils.recordings.byId.invalidate()
        handlers?.onJobStarted?.(event)
      } else if (event.type === 'job:completed') {
        refreshJobData()
        handlers?.onJobCompleted?.(event)
      } else if (event.type === 'job:failed') {
        refreshJobData()
        handlers?.onJobFailed?.(event)
      }
    },
  })
}
