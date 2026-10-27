import { useBoardId, type SubstrateWriter, type QueryResult, type MutationHandle, type QueryFilter } from '@pls/lens-framework'
import type { PlanItemQuery } from '@pls/substrate'
import { trpc } from './trpc'

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

/** The board-scope part of a filter, as the list endpoints accept it. */
function boardScope(filter: QueryFilter) {
  return { recordingId: filter.recordingId, courseTag: filter.courseTag }
}

export const substrateTrpc: SubstrateWriter = {
  useRecordings(filter?: QueryFilter) {
    return adapt(trpc.recordings.list.useQuery(filter ? { courseTag: filter.courseTag, recordingId: filter.recordingId } : undefined))
  },

  useRecording(id: string) {
    return adapt(trpc.recordings.byId.useQuery(id, {
      enabled: !!id,
      // Job events refresh this too; the poll is a backstop while AI work runs.
      refetchInterval: (query) => ((query.state.data as { processing?: unknown } | null | undefined)?.processing ? 3000 : false),
    }))
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

  useRecordingConnections(recordingId: string | undefined) {
    return adapt(trpc.links.byRecording.useQuery({ recordingId: recordingId ?? '' }, { enabled: !!recordingId }))
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
    return adapt(trpc.planItems.refitPreview.useQuery({ timeZone }, { refetchInterval: 60_000 }))
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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usePlanItemMutation(procedure: { useMutation: (opts: { onSuccess: () => void }) => any }) {
  const utils = trpc.useUtils()
  return procedure.useMutation({
    onSuccess: () => {
      utils.planItems.invalidate()
      utils.tags.invalidate()
    },
  })
}
