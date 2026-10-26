import type { SubstrateWriter, QueryResult, MutationHandle, QueryFilter } from '@pls/lens-framework'
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

/** The board-scope part of a filter, as the list endpoints accept it. */
function boardScope(filter: QueryFilter) {
  return { recordingId: filter.recordingId, courseTag: filter.courseTag }
}

export const substrateTrpc: SubstrateWriter = {
  useRecordings(filter?: QueryFilter) {
    return adapt(trpc.recordings.list.useQuery(filter ? { courseTag: filter.courseTag, recordingId: filter.recordingId } : undefined))
  },

  useRecording(id: string) {
    return adapt(trpc.recordings.byId.useQuery(id, { enabled: !!id }))
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

  useRecordingConnections(recordingId: string | undefined, filter?: QueryFilter) {
    return adapt(trpc.links.byRecording.useQuery(
      { recordingId: recordingId ?? '', courseTag: filter?.courseTag },
      { enabled: !!recordingId },
    ))
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

  useCreateTag() {
    const utils = trpc.useUtils()
    return adaptMutation(trpc.tags.create.useMutation({
      onSuccess: () => {
        utils.tags.invalidate()
        utils.aggregates.invalidate()
      },
    }))
  },

  useCreateAnnotation() {
    return adaptMutation(trpc.annotations.create.useMutation())
  },

  useRecordConfidence() {
    const utils = trpc.useUtils()
    return adaptMutation(trpc.confidence.record.useMutation({
      onSuccess: () => {
        utils.confidence.invalidate()
        utils.aggregates.invalidate()
      },
    }))
  },

  useCreatePlanItem() {
    return adaptMutation(usePlanItemMutation(trpc.planItems.create))
  },

  useUpdatePlanItem() {
    return adaptMutation(usePlanItemMutation(trpc.planItems.update))
  },

  useCompletePlanItem() {
    return adaptMutation(usePlanItemMutation(trpc.planItems.complete))
  },

  useDismissPlanItem() {
    return adaptMutation(usePlanItemMutation(trpc.planItems.dismiss))
  },

  useDeletePlanItem() {
    return adaptMutation(usePlanItemMutation(trpc.planItems.delete))
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
