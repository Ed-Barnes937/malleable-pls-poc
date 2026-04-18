export { initDb, getDb, persistDb, resetDb, query, exec } from './db'

export { useRecordings, useRecording } from './hooks/useRecordings'
export { useTranscript } from './hooks/useTranscript'
export { useTags, useTagsForTarget, useCreateTag, useDeleteTag } from './hooks/useTags'
export { useAnnotations, useCreateAnnotation } from './hooks/useAnnotations'
export { useConfidence, useRecordConfidence } from './hooks/useConfidence'
export { useConnections } from './hooks/useLinks'
export { useWeeklyOverview, useGapAnalysis, useWeakestTopics } from './hooks/useAggregates'
export {
  useWorkspaces,
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useReplacePanelLens,
  useUpdatePanelSpan,
  useSetWorkspaceScope,
} from './hooks/useWorkspaces'

export { QUESTIONS } from './questions'

export type {
  Recording,
  TranscriptSegment,
  Annotation,
  Tag,
  Link,
  ConfidenceSignal,
  LensData,
  Workspace,
  WorkspacePanel,
  WorkspaceScope,
  Scope,
  CourseOverview,
  CourseGap,
  WeakTopic,
  ConnectionResult,
  NewTag,
  NewAnnotation,
  NewConfidenceSignal,
  Question,
} from './types'
