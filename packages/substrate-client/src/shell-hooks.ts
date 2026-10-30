import { trpc } from './trpc'
import type { Scope, ScopeDim } from '@pls/lens-framework'
import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { WorkflowWithJobs, JobRun } from '@pls/workflows'
import type { BoardScope, Lecture, PlanItemQuery } from '@pls/substrate'
import { applyBoardScopePatches, withBoardScope, type BoardScopePatch } from './board-scope'

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

/**
 * A board's scope rows; no request without a board (`null`). Not re-read on
 * window focus while a scope write is unanswered: that would show the board
 * without it (the last write re-reads it).
 */
export function useWorkspaceScopes(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return trpc.workspaces.scopes.useQuery(workspaceId ?? '', {
    enabled: workspaceId !== null,
    refetchOnWindowFocus: () => workspaceId === null || pendingBoardScopeWrites(queryClient, workspaceId).length === 0,
  })
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
 *
 * Optimistic: the board shows the scope the server will leave (both
 * dimensions, by its rules) at once, so a picker never snaps back. Writes go
 * to the server one at a time, in the order made (`BOARD_SCOPE_WRITES`), so
 * two quick changes land the way round the student made them. While any are
 * unanswered the board shows every one of them applied, in order, over the
 * last scope the server confirmed: an answer or a failure changes that base
 * and never wipes a later change, and the board is re-read once the last
 * write is done.
 */
export function useSetBoardScope() {
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  const pendingPatches = (workspaceId: string, except?: unknown) => boardScopePatches(queryClient, workspaceId, except)
  const show = (workspaceId: string, base: BoardScope, except?: unknown) => showBoardScope(utils, queryClient, workspaceId, base, except)

  return trpc.workspaces.setBoardScope.useMutation({
    scope: { id: BOARD_SCOPE_WRITES },
    onMutate: async ({ workspaceId }) => {
      await utils.workspaces.scopes.cancel(workspaceId)
      const rows = utils.workspaces.scopes.getData(workspaceId)
      if (!rows) return
      const bases = confirmedScopes(queryClient)
      // The first of a run of writes: the board as it is now is what the server has.
      if (pendingBoardScopeWrites(queryClient, workspaceId).length === 1 || !bases.has(workspaceId)) {
        bases.set(workspaceId, toBoardScope(decodeScope(rows as unknown as ScopeRow[])))
      }
      show(workspaceId, bases.get(workspaceId)!)
    },
    onSuccess: (scope, input) => {
      // The server's answer is the new base, until the refetch confirms it.
      confirmedScopes(queryClient).set(input.workspaceId, scope)
      show(input.workspaceId, scope, input)
      // A lecture made a moment ago (an upload) may not be in the picker's list yet.
      if (input.lectureId) utils.lectures.invalidate()
    },
    onError: (error, input) => {
      // The base is unchanged: show it with only the writes still to come.
      const base = confirmedScopes(queryClient).get(input.workspaceId)
      if (base) show(input.workspaceId, base, input)
      refetchBoardsIfGone(utils, error)
    },
    onSettled: (_data, _error, input) => {
      // A re-read while later writes wait would show the board without them.
      if (pendingPatches(input.workspaceId, input).length > 0) return
      confirmedScopes(queryClient).delete(input.workspaceId)
      return utils.workspaces.scopes.invalidate(input.workspaceId)
    },
  })
}

/** Mutation scope for board scope writes: they reach the server one at a time, in order. */
export const BOARD_SCOPE_WRITES = 'board-scope'

type BoardScopeWrite = BoardScopePatch & { workspaceId: string }

/** A board's unanswered (pending or queued) scope writes, oldest first. */
function pendingBoardScopeWrites(queryClient: QueryClient, workspaceId: string) {
  return queryClient
    .getMutationCache()
    .findAll({
      status: 'pending',
      predicate: (m) =>
        m.options.scope?.id === BOARD_SCOPE_WRITES && (m.state.variables as BoardScopeWrite | undefined)?.workspaceId === workspaceId,
    })
    .sort((a, b) => a.mutationId - b.mutationId)
}

/**
 * The board's unanswered scope writes, oldest first, less `except` (the one
 * finishing), as patches. A class open or an Undo is in the queue too, as a
 * patch of nothing: the board shows its answer once it lands
 * (`settleBoardScopeWrite`).
 */
function boardScopePatches(queryClient: QueryClient, workspaceId: string, except?: unknown): BoardScopePatch[] {
  return pendingBoardScopeWrites(queryClient, workspaceId)
    .filter((m) => m.state.variables !== except)
    .map((m) => {
      const { courseTag, lectureId } = m.state.variables as BoardScopeWrite
      return { ...(courseTag !== undefined && { courseTag }), ...(lectureId !== undefined && { lectureId }) }
    })
}

/** Shows `base` on the board with its unanswered writes (less `except`) on top. */
function showBoardScope(
  utils: ReturnType<typeof trpc.useUtils>,
  queryClient: QueryClient,
  workspaceId: string,
  base: BoardScope,
  except?: unknown,
) {
  const next = applyBoardScopePatches(base, boardScopePatches(queryClient, workspaceId, except), (id) => cachedLectureCourse(queryClient, id))
  utils.workspaces.scopes.setData(workspaceId, (rows) => rows && replaceBoardScope(rows, workspaceId, next))
}

/**
 * A board scope write other than `setBoardScope` (a class open, Undo) is
 * done, leaving the board at `scope` (unknown when it failed). With later
 * writes still to come, that is the new base they show over, as for
 * `setBoardScope`; once it is the last, the board is re-read.
 */
function settleBoardScopeWrite(
  utils: ReturnType<typeof trpc.useUtils>,
  queryClient: QueryClient,
  workspaceId: string,
  self: unknown,
  scope: BoardScope | undefined,
) {
  if (pendingBoardScopeWrites(queryClient, workspaceId).some((m) => m.state.variables !== self)) {
    const bases = confirmedScopes(queryClient)
    if (scope) bases.set(workspaceId, scope)
    const base = bases.get(workspaceId)
    if (base) showBoardScope(utils, queryClient, workspaceId, base, self)
    return
  }
  confirmedScopes(queryClient).delete(workspaceId)
  void utils.workspaces.scopes.invalidate(workspaceId)
}

/** Per query client, each board's scope as the server last confirmed it, while writes to it are unanswered. */
const confirmedByClient = new WeakMap<QueryClient, Map<string, BoardScope>>()
function confirmedScopes(queryClient: QueryClient): Map<string, BoardScope> {
  let bases = confirmedByClient.get(queryClient)
  if (!bases) confirmedByClient.set(queryClient, (bases = new Map()))
  return bases
}

/** `withBoardScope` on the cached `workspaces.scopes` rows, keeping their type. */
function replaceBoardScope<Rows>(rows: Rows, workspaceId: string, scope: BoardScope): Rows {
  return withBoardScope(rows as unknown as ScopeRow[], workspaceId, scope) as unknown as Rows
}

function toBoardScope(scope: Scope): BoardScope {
  return { courseTag: scope.courseTag ?? null, lectureId: scope.lectureId ?? null }
}

/**
 * A lecture's course as the client has it cached, null when filed under no
 * course; undefined when no cached query has it. From any `lectures.byId` or
 * `lectures.list`, else from a cached recording of it (`recordings.byId`
 * carries its lecture's course): opening a moment fetches that recording
 * just before it selects the lecture, often one of another course.
 */
export function cachedLectureCourse(queryClient: QueryClient, lectureId: string): string | null | undefined {
  for (const [, data] of queryClient.getQueriesData<Lecture | Lecture[] | null>({ queryKey: LECTURE_QUERIES })) {
    const lecture = (Array.isArray(data) ? data : [data]).find((l) => l?.id === lectureId)
    if (lecture) return lecture.course
  }
  for (const [, row] of queryClient.getQueriesData<unknown>({ queryKey: RECORDING_QUERIES })) {
    if (isRecordingOf(row, lectureId)) return row.course
  }
  return undefined
}

function isRecordingOf(row: unknown, lectureId: string): row is { course: string | null } {
  return typeof row === 'object' && row !== null
    && (row as { lecture_id?: unknown }).lecture_id === lectureId
    && 'course' in row
}

/** `recordings.byId` queries only: its `course` is its lecture's (`recordingCourse` on the server). */
const RECORDING_QUERIES = [['recordings', 'byId']]

/** Every `lectures.*` query (tRPC keys start with the procedure path). */
const LECTURE_QUERIES = [['lectures']]

/**
 * Renames a lecture (`title`) and/or refiles it under another course
 * (`course`, null = none). A new title shows at once wherever the lecture is
 * cached (the header's lecture pill, Transcript), and comes back if the
 * write fails.
 */
export function useUpdateLecture() {
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  return trpc.lectures.update.useMutation({
    onMutate: async ({ id, title }) => {
      if (title === undefined) return { prev: [] }
      await queryClient.cancelQueries({ queryKey: LECTURE_QUERIES })
      const prev = queryClient.getQueriesData<Lecture | Lecture[] | null>({ queryKey: LECTURE_QUERIES })
      const rename = (l: Lecture | null | undefined) => (l?.id === id ? { ...l, title } : l)
      queryClient.setQueriesData<Lecture | Lecture[] | null>({ queryKey: LECTURE_QUERIES }, (data) =>
        Array.isArray(data) ? data.map((l) => rename(l)!) : rename(data),
      )
      return { prev }
    },
    onError: (_error, _input, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) queryClient.setQueryData(key, data)
    },
    onSettled: (_data, _error, input) => {
      void utils.lectures.invalidate()
      // A course change re-scopes the boards that have the lecture selected.
      if (input.course !== undefined) void utils.workspaces.scopes.invalidate()
    },
  })
}

/**
 * A calendar class occurrence's lecture (`lectures.forClassOccurrence`):
 * found or made (exactly one per occurrence), and with `workspaceId` selected
 * on that board in the same transaction. The answer's `board` (before and
 * after) is what Undo works from (`useRestoreBoardScope`). The lecture goes
 * straight into the cache (its recordings say whether it is recorded), the
 * lectures are refreshed (one may be new) and so is the board's scope; a
 * board that is gone refreshes the board list. One of the board scope
 * writes (`BOARD_SCOPE_WRITES`).
 */
export function useClassOccurrenceLecture() {
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  return trpc.lectures.forClassOccurrence.useMutation({
    scope: { id: BOARD_SCOPE_WRITES },
    onError: (error, input) => {
      if (input.workspaceId) settleBoardScopeWrite(utils, queryClient, input.workspaceId, input, undefined)
      refetchBoardsIfGone(utils, error)
    },
    onSuccess: ({ lecture, board }, input) => {
      utils.lectures.byId.setData(lecture.id, lecture)
      void utils.lectures.invalidate()
      if (input.workspaceId) settleBoardScopeWrite(utils, queryClient, input.workspaceId, input, board?.after)
    },
  })
}

/**
 * Undo for a board scope change (`workspaces.restoreBoardScope`): puts back
 * `to` only while the board still shows `ifBoardShows`, so a change made
 * since, anywhere, is kept (`restored: false`). One of the board scope
 * writes (`BOARD_SCOPE_WRITES`), in order with the rest.
 */
export function useRestoreBoardScope() {
  const utils = trpc.useUtils()
  const queryClient = useQueryClient()
  return trpc.workspaces.restoreBoardScope.useMutation({
    scope: { id: BOARD_SCOPE_WRITES },
    onError: (error, input) => {
      settleBoardScopeWrite(utils, queryClient, input.workspaceId, input, undefined)
      refetchBoardsIfGone(utils, error)
    },
    onSuccess: ({ scope }, input) => settleBoardScopeWrite(utils, queryClient, input.workspaceId, input, scope),
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
