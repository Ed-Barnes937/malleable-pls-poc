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
import type { Scope, ScopeDim } from './types'

/**
 * Query input for substrate hooks. Extends the workspace-level `Scope` with
 * `recordingId`, which is a per-panel target rather than a workspace-level
 * filter — tools spread their workspace scope and add their recording.
 */
export interface QueryFilter extends Scope {
  recordingId?: string
}

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
  useRecordings: (filter?: QueryFilter) => QueryResult<Recording[]>
  useRecording: (id: string) => QueryResult<Recording>
  useTranscript: (recordingId: string) => QueryResult<TranscriptSegment[]>
  useTags: (filter: QueryFilter) => QueryResult<Tag[]>
  useTagsForTarget: (targetType: string, targetId: string) => QueryResult<Tag[]>
  useAnnotations: (filter: QueryFilter) => QueryResult<Annotation[]>
  useConfidence: (filter: QueryFilter) => QueryResult<ConfidenceSignal[]>
  useConnections: (conceptSegmentId: string) => QueryResult<ConnectionResult[]>
  useRecordingConnections: (recordingId: string | undefined) => QueryResult<ConnectionResult[]>
  useWeeklyOverview: (filter: QueryFilter) => QueryResult<CourseOverview[]>
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
  /** Trigger event identifiers this lens can fire. Drives the per-lens workflow editor's trigger dropdown. */
  emits?: string[]
  /**
   * Workspace-level filter dimensions this lens consumes. The shell unions
   * these across all panels in a workspace to decide which scope controls
   * to surface. Omit (or leave empty) for lenses that don't consume any
   * workspace-level filter — they'll receive an empty scope.
   */
  filters?: ScopeDim[]
  load: () => Promise<{ default: ComponentType<import('./types').LensProps> }>

  /** Size constraints — used to clamp resize and provide defaults for new panels */
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  defaultWidth?: number
  defaultHeight?: number

  /** @deprecated Use individual size fields instead */
  defaultSize?: { w: number; h: number }
}
