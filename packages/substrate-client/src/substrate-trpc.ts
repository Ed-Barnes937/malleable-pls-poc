import { useCallback } from 'react'
import { useBoardId, type SubstrateWriter, type QueryResult, type MutationHandle, type QueryFilter } from '@pls/lens-framework'
import { useQueryClient } from '@tanstack/react-query'
import { applyPreferencesUpdate, type PlanItemQuery, type RefitPreview, type WorkflowWithJobs } from '@pls/substrate'
import { trpc } from './trpc'
import { PREFERENCES_SCOPE, usePreferencesQueryOptions } from './shell-hooks'
import { setLiveCapture, useLiveCaptureOf } from './live-capture'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adapt<T>(query: { data: any; isLoading: boolean; error: any }): QueryResult<T> {
  return { data: query.data as T | undefined, isLoading: query.isLoading, error: query.error as Error | null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptMutation<TInput, TOutput = TInput>(mutation: any): MutationHandle<TInput, TOutput> {
  return { mutate: mutation.mutate, mutateAsync: mutation.mutateAsync, isPending: mutation.isPending }
}

/**
 * Like adaptMutation, but sends the panel's board with every call so the
 * server runs that board's automations (a copy switched off on this board
 * stays off). `toInput` builds the wire input from the lens-facing one.
 */
function useOnBoard<TInput, TOutput>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation: any,
  toInput: (input: TInput, workspaceId: string | null) => unknown = (input, workspaceId) => ({ ...(input as object), workspaceId }),
): MutationHandle<TInput, TOutput> {
  const boardId = useBoardId()
  return {
    mutate: (input: TInput) => mutation.mutate(toInput(input, boardId)),
    mutateAsync: (input: TInput) => mutation.mutateAsync(toInput(input, boardId)),
    isPending: mutation.isPending,
  }
}

/** The scope part of a filter, as the list endpoints accept it. */
function boardScope(filter: QueryFilter) {
  return { courseTag: filter.courseTag, lectureId: filter.lectureId, recordingId: filter.recordingId }
}

/** While a lecture's AI work runs, poll as a backstop to the job events that refresh it. */
function pollWhileProcessing(data: unknown): number | false {
  const lecture = data as { recordings?: { processing?: unknown }[] } | null | undefined
  return lecture?.recordings?.some((r) => r.processing) ? 3000 : false
}

export const substrateTrpc: SubstrateWriter = {
  useRecordings(filter?: QueryFilter) {
    return adapt(trpc.recordings.list.useQuery(filter ? { courseTag: filter.courseTag, lectureId: filter.lectureId } : undefined))
  },

  useLecture(id: string | undefined) {
    return adapt(trpc.lectures.byId.useQuery(id ?? '', {
      enabled: !!id,
      refetchInterval: (query) => pollWhileProcessing(query.state.data),
    }))
  },

  useLectures(filter?: { courseTag?: string }) {
    return adapt(trpc.lectures.list.useQuery(filter?.courseTag ? { courseTag: filter.courseTag } : undefined))
  },

  useLiveCapture(lectureId: string | undefined) {
    return useLiveCaptureOf(lectureId)
  },

  useRecording(id: string) {
    return adapt(trpc.recordings.byId.useQuery(id, {
      enabled: !!id,
      // Job events refresh this too; the poll is a backstop while AI work runs.
      refetchInterval: (query) => ((query.state.data as { processing?: unknown } | null | undefined)?.processing ? 3000 : false),
    }))
  },

  useAutomation(id: string) {
    // Polled while shown, so "Made by ..." goes once the automation is deleted elsewhere.
    return adapt(trpc.workflows.byId.useQuery(id, { enabled: !!id, refetchInterval: 30_000 })) as QueryResult<WorkflowWithJobs>
  },

  useTranscript(recordingId: string) {
    return adapt(trpc.transcripts.byRecording.useQuery(recordingId, { enabled: !!recordingId }))
  },

  useTags(filter: QueryFilter) {
    return adapt(trpc.tags.list.useQuery(boardScope(filter)))
  },

  useAnnotations(filter: QueryFilter) {
    return adapt(trpc.annotations.list.useQuery(boardScope(filter)))
  },

  useConfidence(filter: QueryFilter) {
    return adapt(trpc.confidence.list.useQuery(boardScope(filter)))
  },

  useConnections(conceptSegmentId: string, filter?: QueryFilter) {
    return adapt(trpc.links.connections.useQuery(
      { segmentId: conceptSegmentId, courseTag: filter?.courseTag },
      { enabled: !!conceptSegmentId },
    ))
  },

  useLectureConnections(lectureId: string | undefined) {
    return adapt(trpc.links.byLecture.useQuery({ lectureId: lectureId ?? '' }, { enabled: !!lectureId }))
  },

  useWeeklyOverview(filter: QueryFilter) {
    return adapt(trpc.aggregates.weeklyOverview.useQuery({ courseTag: filter.courseTag }))
  },

  useGapAnalysis() {
    return adapt(trpc.aggregates.gapAnalysis.useQuery())
  },

  useWeakestTopics(filter: QueryFilter, limit?: number) {
    return adapt(trpc.aggregates.weakestTopics.useQuery({ limit, courseTag: filter.courseTag }))
  },

  usePlanItems(query?: PlanItemQuery) {
    return adapt(trpc.planItems.list.useQuery(query))
  },

  useRefitPreview(timeZone: string) {
    // Blocks become "missed" as time passes, not only when data changes.
    const query = trpc.planItems.refitPreview.useQuery({ timeZone }, { refetchInterval: 60_000 })
    const { refetch } = query
    return {
      ...adapt<RefitPreview>(query),
      refetch: useCallback(async () => {
        const result = await refetch({ throwOnError: true })
        return (result.data ?? []) as RefitPreview
      }, [refetch]),
    }
  },

  useCreateTag() {
    const utils = trpc.useUtils()
    return useOnBoard(trpc.tags.create.useMutation({
      onSuccess: () => {
        utils.tags.invalidate()
        utils.aggregates.invalidate()
      },
    }))
  },

  useCreateAnnotation() {
    const utils = trpc.useUtils()
    return useOnBoard(trpc.annotations.create.useMutation({
      onSuccess: () => utils.annotations.invalidate(),
    }))
  },

  useTranscribeRecording() {
    const utils = trpc.useUtils()
    return useOnBoard(trpc.recordings.transcribe.useMutation({
      onSuccess: () => {
        utils.recordings.invalidate()
        utils.lectures.invalidate()
        utils.jobs.invalidate()
      },
    }))
  },

  useRecordingAdded() {
    const utils = trpc.useUtils()
    return useCallback(() => {
      utils.recordings.invalidate()
      utils.lectures.invalidate()
      // An upload that made a lecture may have selected it on the board.
      utils.workspaces.scopes.invalidate()
    }, [utils])
  },

  useStartLecture() {
    const utils = trpc.useUtils()
    const boardId = useBoardId()
    const mutation = trpc.lectures.create.useMutation({
      onSuccess: () => {
        utils.lectures.invalidate()
        if (boardId) utils.workspaces.scopes.invalidate(boardId)
      },
    })
    const toInput = ({ course }: { course: string | null }) => ({
      course,
      matchClass: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(boardId ? { workspaceId: boardId } : {}),
    })
    return {
      mutate: (input: { course: string | null }) => mutation.mutate(toInput(input)),
      mutateAsync: (input: { course: string | null }) => mutation.mutateAsync(toInput(input)),
      isPending: mutation.isPending,
    }
  },

  useSetLiveCapture() {
    return setLiveCapture
  },

  useRecordConfidence() {
    const utils = trpc.useUtils()
    return useOnBoard(trpc.confidence.record.useMutation({
      onSuccess: () => {
        utils.confidence.invalidate()
        utils.aggregates.invalidate()
      },
    }))
  },

  useCreatePlanItem() {
    return useOnBoard(usePlanItemMutation(trpc.planItems.create))
  },

  useUpdatePlanItem() {
    return useOnBoard(usePlanItemMutation(trpc.planItems.update))
  },

  useCompletePlanItem() {
    return useOnBoard(usePlanItemMutation(trpc.planItems.complete), (id: string, workspaceId) => ({ id, workspaceId }))
  },

  useDismissPlanItem() {
    return useOnBoard(usePlanItemMutation(trpc.planItems.dismiss), (id: string, workspaceId) => ({ id, workspaceId }))
  },

  useDeletePlanItem() {
    return adaptMutation(usePlanItemMutation(trpc.planItems.delete))
  },

  useAutofillPlan() {
    // Advice only: nothing is written, so nothing to invalidate.
    return adaptMutation(trpc.planning.autofill.useMutation())
  },

  usePreferences() {
    return adapt(trpc.preferences.get.useQuery(undefined, usePreferencesQueryOptions()))
  },

  useUpdatePreferences() {
    const utils = trpc.useUtils()
    const queryClient = useQueryClient()
    return adaptMutation(trpc.preferences.update.useMutation({
      // Saves go to the server one at a time, in the order made, so two
      // quick changes can't land the wrong way round.
      scope: { id: PREFERENCES_SCOPE },
      // Every reader shows the change straight away (a select never snaps
      // back while it saves), each change on top of the last.
      onMutate: async (patch) => {
        await utils.preferences.get.cancel()
        utils.preferences.get.setData(undefined, (prefs) => (prefs ? applyPreferencesUpdate(prefs, patch) : prefs))
      },
      // Once the last save is done (or failed), every reader re-reads what the
      // server has; resolves when they have it. The re-fit preview is placed
      // inside study hours and the budget, so it refreshes too.
      onSettled: () => {
        const saving = queryClient.isMutating({ predicate: (m) => m.options.scope?.id === PREFERENCES_SCOPE })
        // This save still counts as pending here.
        if (saving > 1) return
        return Promise.all([utils.preferences.invalidate(), utils.planItems.refitPreview.invalidate()])
      },
    }))
  },

  useAcceptRefit() {
    const utils = trpc.useUtils()
    return useOnBoard(trpc.planItems.refit.useMutation({
      // On a conflict too: the preview is stale either way.
      onSettled: () => {
        utils.planItems.invalidate()
      },
    }))
  },
}

/**
 * Plan item mutations refresh every plan item list (Calendar, To-do and
 * Coming up all read the same data) plus tags, which carry the course.
 * A save resolves once the lists on screen have refetched, so they already
 * show the server's state (including anything changed elsewhere meanwhile).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usePlanItemMutation(procedure: { useMutation: (opts: { onSuccess: () => Promise<unknown> }) => any }) {
  const utils = trpc.useUtils()
  return procedure.useMutation({
    onSuccess: () => Promise.all([utils.planItems.invalidate(), utils.tags.invalidate()]),
  })
}
