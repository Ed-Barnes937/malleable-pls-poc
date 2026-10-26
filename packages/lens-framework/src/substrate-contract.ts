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
import type { DateRange, Scope, ScopeDeclaration } from './types'

/**
 * Query input for substrate hooks. Lenses pass their (already narrowed) board
 * `Scope` straight through, plus a `dateRange` when the widget shows a window
 * of time it navigates itself.
 */
export type QueryFilter = Scope & { dateRange?: DateRange }

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
  useAnnotations: (filter: QueryFilter) => QueryResult<Annotation[]>
  useConfidence: (filter: QueryFilter) => QueryResult<ConfidenceSignal[]>
  useConnections: (conceptSegmentId: string, filter?: QueryFilter) => QueryResult<ConnectionResult[]>
  useRecordingConnections: (recordingId: string | undefined, filter?: QueryFilter) => QueryResult<ConnectionResult[]>
  useWeeklyOverview: (filter: QueryFilter) => QueryResult<CourseOverview[]>
  useGapAnalysis: () => QueryResult<CourseGap[]>
  useWeakestTopics: (filter: QueryFilter, limit?: number) => QueryResult<WeakTopic[]>
}

// ---------------------------------------------------------------------------
// SubstrateWriter — extends reader with mutation capabilities for tools
// ---------------------------------------------------------------------------

export interface SubstrateWriter extends SubstrateReader {
  useCreateTag: () => MutationHandle<NewTag>
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
  reads: TableName[]
  /** Tables this widget writes. Declaring any grants it writer access. */
  writes?: TableName[]
  /** Trigger event identifiers this lens can fire. Drives the per-lens workflow editor's trigger dropdown. */
  emits?: string[]
  /**
   * How this widget responds to each board scope dimension. The shell hands
   * the widget only the dimensions it uses, and unions them across the board
   * to decide which scope pickers and chip parts to show. Omit for a widget
   * that ignores board scope entirely.
   */
  scope?: ScopeDeclaration
  load: () => Promise<{ default: ComponentType<import('./types').LensProps> }>

  /** Size constraints — used to clamp resize and provide defaults for new panels */
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  defaultWidth?: number
  defaultHeight?: number

}
