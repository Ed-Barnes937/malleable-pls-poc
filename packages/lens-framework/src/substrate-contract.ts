import type { ComponentType } from 'react'
import type {
  Lecture,
  Recording,
  TranscriptSegment,
  Tag,
  Annotation,
  ConfidenceSignal,
  ConnectionResult,
  CourseProgress,
  WeakTopic,
  NewTag,
  NewAnnotation,
  NewConfidenceSignal,
  PlanItem,
  PlanItemOccurrence,
  PlanItemQuery,
  NewPlanItem,
  PlanItemUpdate,
  PlanAdvice,
  PlanAutofillInput,
  PreferencesUpdate,
  UserPreferences,
  RefitAccept,
  RefitPreview,
  RefitResult,
  WorkflowWithJobs,
  Resource,
  ResourceWithBody,
  ResourceListQuery,
  NewResourceLink,
  NewResourceNote,
  ResourceUpdate,
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
 * Readers apply every dimension given (course, lecture, recording); the
 * server keeps a board's lecture inside its course, so they never disagree.
 * `recordingId` is not a board dimension: it narrows to one recording of a
 * lecture, e.g. the one a study block came from.
 */
export type QueryFilter = Scope & { recordingId?: string; dateRange?: DateRange }

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
  | 'lectures'
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
  | 'user_preferences'
  | 'resources'

// ---------------------------------------------------------------------------
// SubstrateReader — read-only hooks for view lenses
// ---------------------------------------------------------------------------

export interface SubstrateReader {
  useRecordings: (filter?: QueryFilter) => QueryResult<Recording[]>
  useRecording: (id: string) => QueryResult<Recording>
  /**
   * One lecture with its recordings (oldest first, each with `processing`),
   * or null if it isn't the student's. No request for an empty id.
   */
  useLecture: (id: string | undefined) => QueryResult<Lecture>
  /** The student's lectures, latest first, optionally only one course's. */
  useLectures: (filter?: { courseTag?: string }) => QueryResult<Lecture[]>
  useTranscript: (recordingId: string) => QueryResult<TranscriptSegment[]>
  useTags: (filter: QueryFilter) => QueryResult<Tag[]>
  useAnnotations: (filter: QueryFilter) => QueryResult<Annotation[]>
  useConfidence: (filter: QueryFilter) => QueryResult<ConfidenceSignal[]>
  useConnections: (conceptSegmentId: string, filter?: QueryFilter) => QueryResult<ConnectionResult[]>
  /** Links out of the moments of a lecture's recordings. No request without a lecture. */
  useLectureConnections: (lectureId: string | undefined) => QueryResult<ConnectionResult[]>
  useWeeklyOverview: (filter: QueryFilter) => QueryResult<CourseProgress[]>
  useGapAnalysis: () => QueryResult<CourseProgress[]>
  useWeakestTopics: (filter: QueryFilter, limit?: number) => QueryResult<WeakTopic[]>
  /**
   * Plan items (commitments, deadlines, to-dos). Pass `from`/`to` to get one
   * row per occurrence in that range, with weekly recurrences expanded.
   */
  usePlanItems: (query?: PlanItemQuery) => QueryResult<PlanItemOccurrence[]>
  /**
   * To-dos whose time block ended without being done, each with where re-fit
   * would put it now (or why it doesn't fit). Empty when nothing was missed.
   * Always across every course: scope never changes where things go. Refreshed
   * every minute, as blocks end. `refetch` asks the server now (e.g. right
   * before showing new times), resolving with the fresh preview.
   */
  useRefitPreview: (timeZone: string) => QueryResult<RefitPreview> & { refetch: () => Promise<RefitPreview> }
  /**
   * One automation with its jobs, e.g. the one that made a plan item
   * (`PlanItem.created_by_workflow_id`); null once it has been deleted.
   * Disabled for an empty id.
   */
  useAutomation: (id: string) => QueryResult<WorkflowWithJobs>
  /**
   * The student's study rhythm, defaults filled in: study hours per weekday
   * (null = no study that day), study time per day, and time zone (null when
   * not set: use the browser's). One per user, the same on every board; what
   * automatic placement (Auto-fill, reviews, re-fit) obeys.
   */
  usePreferences: () => QueryResult<UserPreferences>
  /**
   * The student's links and notes, newest first, without note bodies
   * (`excerpt` instead). `courseTag` keeps those in the course (filed under
   * it or one of its lectures), `lectureId` those of the lecture.
   */
  useResources: (filter?: ResourceListQuery) => QueryResult<Resource[]>
  /**
   * One resource with its note body, or null. No request for an empty id.
   * `refetch` reads it from the server now (e.g. after a CONFLICT), resolving
   * with what it has.
   */
  useResource: (id: string | undefined) => QueryResult<ResourceWithBody> & { refetch: () => Promise<ResourceWithBody | null> }
}

/**
 * A mutation refused because the data changed since the widget last read it
 * (the server's CONFLICT, e.g. a stale re-fit preview), as opposed to a
 * network or server failure worth retrying as is.
 */
export function isConflictError(err: unknown): boolean {
  const data = (err as { data?: { code?: unknown } } | null)?.data
  return data?.code === 'CONFLICT'
}

/** Whether `err` is the server saying the thing does not exist (or is not the student's). */
export function isNotFoundError(err: unknown): boolean {
  const data = (err as { data?: { code?: unknown } } | null)?.data
  return data?.code === 'NOT_FOUND'
}

// ---------------------------------------------------------------------------
// SubstrateWriter — extends reader with mutation capabilities for tools
// ---------------------------------------------------------------------------

export interface SubstrateWriter extends SubstrateReader {
  useCreateTag: () => MutationHandle<NewTag>
  useCreateAnnotation: () => MutationHandle<NewAnnotation>
  useRecordConfidence: () => MutationHandle<NewConfidenceSignal>
  /**
   * Transcribes a lecture the automations never picked up. `queued` is false
   * when it already has a transcript or one is on its way.
   */
  useTranscribeRecording: () => MutationHandle<{ recordingId: string }, { queued: boolean }>
  /**
   * After a recording is added outside the substrate (the `/upload` route):
   * refreshes what lists recordings and lectures, e.g. the lecture it went
   * into now has another part.
   */
  useRecordingAdded: () => () => void
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
  /**
   * Help me plan's Auto-fill advice for a week (priority order, trims when
   * over capacity, a short note). Writes and places nothing: place with
   * `draftPlan` from @pls/substrate and save accepted blocks with
   * `useUpdatePlanItem`.
   */
  useAutofillPlan: () => MutationHandle<PlanAutofillInput, PlanAdvice>

  /**
   * Moves missed blocks to their previewed times. Fails with a CONFLICT
   * (nothing moved) if the week changed since the preview; the preview then
   * refreshes.
   */
  useAcceptRefit: () => MutationHandle<Omit<RefitAccept, 'workspaceId'>, RefitResult>
  /**
   * Changes the study rhythm: fields left out are unchanged, `null` resets
   * one to its default. Resolves with the result, defaults filled in.
   */
  useUpdatePreferences: () => MutationHandle<PreferencesUpdate, UserPreferences>

  /** A link; refused (BAD_REQUEST) unless http(s). Sent with the panel's board. */
  useCreateResourceLink: () => MutationHandle<Omit<NewResourceLink, 'workspaceId'>, ResourceWithBody>
  /** A markdown note, empty unless a body is given. Sent with the panel's board. */
  useCreateResourceNote: () => MutationHandle<Omit<NewResourceNote, 'workspaceId'>, ResourceWithBody>
  /**
   * Renames, edits or moves a resource. With `expectedUpdatedAt` it fails
   * with a CONFLICT (see `isConflictError`) if the resource changed since.
   */
  useUpdateResource: () => MutationHandle<ResourceUpdate, ResourceWithBody>
  useDeleteResource: () => MutationHandle<string, { id: string }>
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
  /**
   * The widget can show a recording moment (`LensProps.focusedMoment`), e.g.
   * the Transcript. Decides where `LensProps.onShowMoment` can land.
   */
  showsMoments?: boolean
  /**
   * The widget can show a scheduled plan item (`LensProps.focusedPlanItem`),
   * e.g. the Calendar. Decides whether `LensProps.onShowPlanItem` can land.
   */
  showsPlanItems?: boolean
  load: () => Promise<{ default: ComponentType<import('./types').LensProps> }>

  /** Size constraints — used to clamp resize and provide defaults for new panels */
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  defaultWidth?: number
  defaultHeight?: number

}
