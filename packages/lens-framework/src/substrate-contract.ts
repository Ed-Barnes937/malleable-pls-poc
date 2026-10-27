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
  PlanItem,
  PlanItemOccurrence,
  PlanItemQuery,
  NewPlanItem,
  PlanItemUpdate,
} from '@pls/substrate'
import type { DateRange, Scope, ScopeDeclaration } from './types'

/**
 * Query input for substrate hooks. Lenses pass `LensProps.scope` straight
 * through (it holds only their `filter` / `target` dimensions), plus a
 * `dateRange` when the widget shows a window of time it navigates itself.
 * Never put `LensProps.highlight` here: readers treat every dimension as a
 * hard filter, so a highlight-only widget (e.g. a calendar) would hide the
 * other courses' commitments.
 *
 * When `recordingId` is set, readers return that lecture's data regardless of
 * `courseTag`: a targeted lecture wins over the course.
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
  | 'plan_items'

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
  /** Links out of a targeted lecture; never course-filtered (the target wins). */
  useRecordingConnections: (recordingId: string | undefined) => QueryResult<ConnectionResult[]>
  useWeeklyOverview: (filter: QueryFilter) => QueryResult<CourseOverview[]>
  useGapAnalysis: () => QueryResult<CourseGap[]>
  useWeakestTopics: (filter: QueryFilter, limit?: number) => QueryResult<WeakTopic[]>
  /**
   * Plan items (commitments, deadlines, to-dos). Pass `from`/`to` to get one
   * row per occurrence in that range, with weekly recurrences expanded.
   */
  usePlanItems: (query?: PlanItemQuery) => QueryResult<PlanItemOccurrence[]>
}

// ---------------------------------------------------------------------------
// SubstrateWriter — extends reader with mutation capabilities for tools
// ---------------------------------------------------------------------------

export interface SubstrateWriter extends SubstrateReader {
  useCreateTag: () => MutationHandle<NewTag>
  useCreateAnnotation: () => MutationHandle<NewAnnotation>
  useRecordConfidence: () => MutationHandle<NewConfidenceSignal>
  useCreatePlanItem: () => MutationHandle<NewPlanItem, PlanItem>
  /**
   * Patches the stored item - the whole series for a recurring one. Send only
   * changed fields, never a list row's occurrence times; to move an occurrence,
   * shift `series_starts_at` / `series_ends_at` by the delta (see PlanItemOccurrence).
   */
  useUpdatePlanItem: () => MutationHandle<PlanItemUpdate, PlanItem>
  /** Marks done. Takes the plan item id. */
  useCompletePlanItem: () => MutationHandle<string, PlanItem>
  /** Marks dismissed ("not doing this"). Takes the plan item id. */
  useDismissPlanItem: () => MutationHandle<string, PlanItem>
  useDeletePlanItem: () => MutationHandle<string, void>
}

// ---------------------------------------------------------------------------
// PanelManifest — single source of truth per panel
// ---------------------------------------------------------------------------

/**
 * What a student wants to do with a widget. The widget palette groups tiles
 * by it, in this order: capture (record or bring in material), study (work
 * through it), plan (organise time and to-dos), review (see how it's going).
 */
export type WidgetGroup = 'capture' | 'study' | 'plan' | 'review'

export interface PanelManifest {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** One short line shown on the palette tile, e.g. "Record or upload a lecture". */
  description: string
  /**
   * Palette group. Declare one on every widget; a widget without one still
   * appears, under "More widgets".
   */
  group?: WidgetGroup
  reads: TableName[]
  /** Tables this widget writes. Declaring any grants it writer access. */
  writes?: TableName[]
  /** Trigger event identifiers this lens can fire. Drives the per-lens workflow editor's trigger dropdown. */
  emits?: string[]
  /**
   * How this widget responds to each board scope dimension. The shell splits
   * the board scope into `LensProps.scope` (filter / target, for readers) and
   * `LensProps.highlight` (styling only), and unions the used dimensions
   * across the board to decide which scope pickers and chip parts to show.
   * Omit for a widget that ignores board scope entirely.
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
