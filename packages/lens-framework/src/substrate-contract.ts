import type { ComponentType } from 'react'
import type {
  Recording,
  TranscriptSegment,
  Tag,
  Annotation,
  ConfidenceSignal,
  ConnectionResult,
  CourseOverview,
  CourseGap,
  WeakTopic,
  NewTag,
  NewAnnotation,
  NewConfidenceSignal,
} from '@pls/substrate'
import type { Scope } from './types'

// ---------------------------------------------------------------------------
// Generic wrappers matching React Query's shape
// ---------------------------------------------------------------------------

export interface QueryResult<T> {
  data: T | undefined | null
  isLoading: boolean
  error: Error | null
}

export interface MutationHandle<TInput, TOutput = TInput> {
  mutate: (input: TInput) => void
  mutateAsync: (input: TInput) => Promise<TOutput>
  isPending: boolean
}

// ---------------------------------------------------------------------------
// Table names — used by PanelManifest to declare data dependencies
// ---------------------------------------------------------------------------

export type TableName =
  | 'recordings'
  | 'transcript_segments'
  | 'tags'
  | 'annotations'
  | 'confidence_signals'
  | 'links'
  | 'weekly_overview'
  | 'gap_analysis'
  | 'weakest_topics'

// ---------------------------------------------------------------------------
// SubstrateReader — read-only hooks for view lenses
// ---------------------------------------------------------------------------

export interface SubstrateReader {
  useRecordings: (scope?: Scope) => QueryResult<Recording[]>
  useRecording: (id: string) => QueryResult<Recording>
  useTranscript: (recordingId: string) => QueryResult<TranscriptSegment[]>
  useTags: (scope: Scope) => QueryResult<Tag[]>
  useTagsForTarget: (targetType: string, targetId: string) => QueryResult<Tag[]>
  useAnnotations: (scope: Scope) => QueryResult<Annotation[]>
  useConfidence: (scope: Scope) => QueryResult<ConfidenceSignal[]>
  useConnections: (conceptSegmentId: string) => QueryResult<ConnectionResult[]>
  useRecordingConnections: (recordingId: string | undefined) => QueryResult<ConnectionResult[]>
  useWeeklyOverview: (scope: Scope) => QueryResult<CourseOverview[]>
  useGapAnalysis: () => QueryResult<CourseGap[]>
  useWeakestTopics: (limit?: number) => QueryResult<WeakTopic[]>
}

// ---------------------------------------------------------------------------
// SubstrateWriter — extends reader with mutation capabilities for tools
// ---------------------------------------------------------------------------

export interface SubstrateWriter extends SubstrateReader {
  useCreateTag: () => MutationHandle<NewTag>
  useDeleteTag: () => MutationHandle<string, void>
  useCreateAnnotation: () => MutationHandle<NewAnnotation>
  useRecordConfidence: () => MutationHandle<NewConfidenceSignal>
}

// ---------------------------------------------------------------------------
// PanelManifest — single source of truth per panel
// ---------------------------------------------------------------------------

export interface PanelManifest {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  description: string
  category: 'tool' | 'view'
  reads: TableName[]
  writes?: TableName[]
  load: () => Promise<{ default: ComponentType<import('./types').LensProps> }>
  defaultSize?: { w: number; h: number }
}
