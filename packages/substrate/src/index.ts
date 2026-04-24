export { initDb, getDb, persistDb, resetDb, query, exec } from './db'

export { useRecordings, useRecording } from './hooks/useRecordings'
export { useTranscript } from './hooks/useTranscript'
export { useTags, useTagsForTarget, useCreateTag, useDeleteTag } from './hooks/useTags'
export { useAnnotations, useCreateAnnotation } from './hooks/useAnnotations'
export { useConfidence, useRecordConfidence } from './hooks/useConfidence'
export { useConnections, useRecordingConnections } from './hooks/useLinks'
export { useWeeklyOverview, useGapAnalysis, useWeakestTopics } from './hooks/useAggregates'
export {
  useWorkspaces,
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useReplacePanelLens,
  useUpdatePanelLayouts,
  useSetWorkspaceScope,
} from './hooks/useWorkspaces'
export {
  useWorkflowsForLens,
  useRecentJobs,
  useRunningJobCount,
  useToggleWorkflow,
  useCreateWorkspaceOverride,
  useJobRunner,
} from './hooks/useWorkflows'

export { dispatchWorkflows } from './workflows/engine'
export { getAvailableJobTypes } from './workflows/executors'

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
  Workflow,
  WorkflowJob,
  WorkflowWithJobs,
  JobRun,
  SubstrateEvent,
  SubstrateEventType,
  LensCategory,
} from './types'
