import { trpc } from './trpc'
import type { Scope, ScopeDim } from '@pls/lens-framework'
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { WorkflowWithJobs, JobRun } from '@pls/workflows'
import type { PlanItemQuery } from '@pls/substrate'

type ScopeRow = { scope_type: string; scope_value: string }

/** `workspace_scopes.scope_type` for each Scope dimension. */
export const SCOPE_TYPE_BY_DIM: Record<ScopeDim, 'tag' | 'lecture'> = {
  courseTag: 'tag',
  lectureId: 'lecture',
}

/** Convert raw DB scope rows into the Scope domain object used by lens components. */
export function decodeScope(rows: ScopeRow[]): Scope {
  const scope: Scope = {}
  for (const s of rows) {
    if (s.scope_type === SCOPE_TYPE_BY_DIM.courseTag) scope.courseTag = s.scope_value
    if (s.scope_type === SCOPE_TYPE_BY_DIM.lectureId) scope.lectureId = s.scope_value
  }
  return scope
}

/**
 * A widget's scope patch (`LensProps.onScopeChange`) as `setBoardScope`
 * input: a dimension named with `undefined` is cleared (null), one left out
 * is unchanged.
 */
export function boardScopePatch(patch: Partial<Scope>): { courseTag?: string | null; lectureId?: string | null } {
  const out: { courseTag?: string | null; lectureId?: string | null } = {}
  if ('courseTag' in patch) out.courseTag = patch.courseTag ?? null
  if ('lectureId' in patch) out.lectureId = patch.lectureId ?? null
  return out
}

export function useWorkspaces() {
  return trpc.workspaces.list.useQuery()
}

/**
 * Every board with the widget types on it, in tab order (`workspaces.summary`):
 * for choosing a board by what it contains. Board and panel changes refresh it.
 */
export function useWorkspaceSummary() {
  return trpc.workspaces.summary.useQuery()
}

/** A board's widgets; no request without a board (`null`). */
export function useWorkspacePanels(workspaceId: string | null) {
  return trpc.workspaces.panels.useQuery(workspaceId ?? '', { enabled: workspaceId !== null })
}

/** A board's scope rows; no request without a board (`null`). */
export function useWorkspaceScopes(workspaceId: string | null) {
  return trpc.workspaces.scopes.useQuery(workspaceId ?? '', { enabled: workspaceId !== null })
}

// Both write the change into the cached board list as well as refetching
// it: if the refetch fails, the list still has the new board (so the open
// board doesn't fall back to the first one) and no longer has the deleted one.
export function useCreateWorkspace() {
  const utils = trpc.useUtils()
  return trpc.workspaces.create.useMutation({
    onSuccess: (ws) => {
      utils.workspaces.list.setData(undefined, (prev) => prev && ([...prev, ws] as typeof prev))
      void utils.workspaces.summary.invalidate()
      return utils.workspaces.list.invalidate()
    },
  })
}

export function useDeleteWorkspace() {
  const utils = trpc.useUtils()
  return trpc.workspaces.delete.useMutation({
    onSuccess: (_data, id) => {
      utils.workspaces.list.setData(undefined, (prev) => prev && (prev.filter((w) => w.id !== id) as typeof prev))
      void utils.workspaces.summary.invalidate()
      return utils.workspaces.list.invalidate()
    },
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
    onSettled: () => {
      void utils.workspaces.summary.invalidate()
      return utils.workspaces.list.invalidate()
    },
  })
}

/**
 * A write that names a board the server doesn't have (deleted in another
 * tab, say) is NOT_FOUND: refetch the board list, so the open board moves to
 * one that still exists.
 */
function refetchBoardsIfGone(utils: ReturnType<typeof trpc.useUtils>, error: { data?: { code?: string } | null }) {
  if (error.data?.code !== 'NOT_FOUND') return
  void utils.workspaces.list.invalidate()
  void utils.workspaces.summary.invalidate()
}

export function useAddWorkspacePanel() {
  const utils = trpc.useUtils()
  return trpc.workspaces.addPanel.useMutation({
    onSuccess: () => {
      void utils.workspaces.summary.invalidate()
      return utils.workspaces.panels.invalidate()
    },
    onError: (error) => refetchBoardsIfGone(utils, error),
  })
}

export function useRemoveWorkspacePanel() {
  const utils = trpc.useUtils()
  return trpc.workspaces.removePanel.useMutation({
    onSuccess: () => {
      void utils.workspaces.summary.invalidate()
      return utils.workspaces.panels.invalidate()
    },
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

/**
 * The one write for a board's course and lecture (`workspaces.setBoardScope`):
 * absent = unchanged, null = clear. The server applies the board rules in
 * the same transaction (a lecture brings its course; a course change clears
 * a lecture outside it), so one user action is one call.
 */
export function useSetBoardScope() {
  const utils = trpc.useUtils()
  return trpc.workspaces.setBoardScope.useMutation({
    onError: (error) => refetchBoardsIfGone(utils, error),
    onSuccess: (_data, input) => {
      utils.workspaces.scopes.invalidate(input.workspaceId)
      // A lecture made a moment ago (an upload) may not be in the picker's list yet.
      if (input.lectureId) utils.lectures.invalidate()
    },
  })
}

/**
 * The TanStack mutation scope for writes that move a board's lecture from
 * one gesture after another (calendar class clicks): they run one at a time,
 * in order, so the last one asked for is the one the board ends on.
 */
export function boardScopeMutationId(workspaceId: string | null): string {
  return `board-scope-${workspaceId ?? 'none'}`
}

/**
 * A calendar class occurrence's lecture (`lectures.forClassOccurrence`):
 * found or made (exactly one per occurrence), and with `workspaceId` selected
 * on that board in the same transaction. The answer's `board.before` is what
 * Undo puts back with `setBoardScope`. Refreshes the lectures (one may be
 * new) and the board's scope; a board that is gone refreshes the board list.
 */
export function useClassOccurrenceLecture(workspaceId: string | null) {
  const utils = trpc.useUtils()
  return trpc.lectures.forClassOccurrence.useMutation({
    scope: { id: boardScopeMutationId(workspaceId) },
    onError: (error) => refetchBoardsIfGone(utils, error),
    onSuccess: (_data, input) => {
      void utils.lectures.invalidate()
      if (input.workspaceId) void utils.workspaces.scopes.invalidate(input.workspaceId)
    },
  })
}

/** The student's lectures, latest first, optionally one course's (the lecture picker). */
export function useLectures(courseTag?: string) {
  return trpc.lectures.list.useQuery(courseTag ? { courseTag } : undefined)
}

/** One lecture with its recordings, looked up by id (e.g. the board's selected lecture). */
export function useLecture(lectureId: string | undefined) {
  return trpc.lectures.byId.useQuery(lectureId ?? '', { enabled: !!lectureId })
}

/**
 * Plan items for shell chrome (the top bar's today line), outside any widget.
 * Shares the `planItems` cache, so every plan item change refreshes it.
 */
export function usePlanItemList(query: PlanItemQuery) {
  return trpc.planItems.list.useQuery(query)
}

/** Mutation scope for preference saves: they run one at a time, in order. */
export const PREFERENCES_SCOPE = 'preferences'

/**
 * How every reader of `preferences.get` refetches it: as any query, except
 * not on window focus while a save is queued, since that refetch would put
 * the old value back over the change already shown. The saves re-read it
 * once the last one settles.
 */
export function usePreferencesQueryOptions() {
  const queryClient = useQueryClient()
  return {
    refetchOnWindowFocus: () => queryClient.isMutating({ predicate: (m) => m.options.scope?.id === PREFERENCES_SCOPE }) === 0,
  }
}

/** The student's study rhythm (study hours, study time per day, zone), defaults filled in. */
export function usePreferences() {
  return trpc.preferences.get.useQuery(undefined, usePreferencesQueryOptions())
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

export function useWorkflowsForWorkspace(workspaceId: string | null): UseQueryResult<WorkflowWithJobs[]> {
  return trpc.workflows.forWorkspace.useQuery({ workspaceId: workspaceId ?? '' }, { enabled: workspaceId !== null }) as unknown as UseQueryResult<WorkflowWithJobs[]>
}

/** One automation with its jobs; null once deleted. */
export function useWorkflow(workflowId: string): UseQueryResult<WorkflowWithJobs | null> {
  return trpc.workflows.byId.useQuery(workflowId, { enabled: !!workflowId }) as unknown as UseQueryResult<WorkflowWithJobs | null>
}

function invalidateWorkflows(utils: ReturnType<typeof trpc.useUtils>) {
  utils.workflows.forLens.invalidate()
  utils.workflows.forWorkspace.invalidate()
  utils.workflows.byId.invalidate()
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
  /** job:completed only - the time block the run placed (e.g. a new review). */
  planItem?: { id: string; startsAt: string }
  /** job:completed only - the run made a to-do but found no time for it. */
  unplaced?: boolean
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
    utils.lectures.invalidate()
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
        utils.lectures.byId.invalidate()
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
