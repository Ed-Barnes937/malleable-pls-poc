import type { SubstrateWriter, QueryResult, MutationHandle } from '@pls/lens-framework'
import type { Scope } from '@pls/lens-framework'
import { trpc } from './trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adapt<T>(query: { data: any; isLoading: boolean; error: any }): QueryResult<T> {
  return { data: query.data as T | undefined, isLoading: query.isLoading, error: query.error as Error | null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptMutation<TInput, TOutput = TInput>(mutation: any): MutationHandle<TInput, TOutput> {
  return { mutate: mutation.mutate, mutateAsync: mutation.mutateAsync, isPending: mutation.isPending }
}

export const substrateTrpc: SubstrateWriter = {
  useRecordings(scope?: Scope) {
    return adapt(trpc.recordings.list.useQuery(scope ? { courseTag: scope.courseTag, recordingId: scope.recordingId } : undefined))
  },

  useRecording(id: string) {
    return adapt(trpc.recordings.byId.useQuery(id, { enabled: !!id }))
  },

  useTranscript(recordingId: string) {
    return adapt(trpc.transcripts.byRecording.useQuery(recordingId, { enabled: !!recordingId }))
  },

  useTags(scope: Scope) {
    return adapt(trpc.tags.list.useQuery({ courseTag: scope.courseTag, recordingId: scope.recordingId, timeframe: scope.timeframe }))
  },

  useTagsForTarget(targetType: string, targetId: string) {
    return adapt(trpc.tags.forTarget.useQuery({ targetType, targetId }))
  },

  useAnnotations(scope: Scope) {
    return adapt(trpc.annotations.list.useQuery({ courseTag: scope.courseTag, recordingId: scope.recordingId, timeframe: scope.timeframe }))
  },

  useConfidence(scope: Scope) {
    return adapt(trpc.confidence.list.useQuery({ courseTag: scope.courseTag, recordingId: scope.recordingId, timeframe: scope.timeframe }))
  },

  useConnections(conceptSegmentId: string) {
    return adapt(trpc.links.connections.useQuery(conceptSegmentId, { enabled: !!conceptSegmentId }))
  },

  useRecordingConnections(recordingId: string | undefined) {
    return adapt(trpc.links.byRecording.useQuery(recordingId ?? '', { enabled: !!recordingId }))
  },

  useWeeklyOverview(scope: Scope) {
    return adapt(trpc.aggregates.weeklyOverview.useQuery({ courseTag: scope.courseTag, recordingId: scope.recordingId, timeframe: scope.timeframe }))
  },

  useGapAnalysis() {
    return adapt(trpc.aggregates.gapAnalysis.useQuery())
  },

  useWeakestTopics(limit?: number) {
    return adapt(trpc.aggregates.weakestTopics.useQuery(limit))
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

  useDeleteTag() {
    const utils = trpc.useUtils()
    return adaptMutation(trpc.tags.delete.useMutation({
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
}
