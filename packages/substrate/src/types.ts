export interface Recording {
  id: string
  title: string
  created_at: string
  duration: number
  audio_url: string | null
  status: string
  /**
   * Course tag label (e.g. 'biology'), stored as a 'recording' tag. Null for a
   * lecture filed under no course.
   */
  course: string | null
  /** By-id reads only: what the lecture's AI jobs are still doing, if anything. */
  processing?: LectureProcessing | null
}

/** A lecture's AI work in progress: its transcript, then its summary. */
export type LectureProcessing = 'transcribing' | 'summarising'

export interface TranscriptSegment {
  id: string
  recording_id: string
  start_ms: number
  end_ms: number
  text: string
  speaker: string | null
}

export interface Annotation {
  id: string
  anchor_type: string
  anchor_id: string
  anchor_start_ms: number | null
  anchor_end_ms: number | null
  body: string
  created_at: string
  author_id: string
}

export interface Tag {
  id: string
  target_type: string
  target_id: string
  label: string
  created_at: string
}

export interface Link {
  id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  relationship: string | null
}

export interface ConfidenceSignal {
  id: string
  target_type: string
  target_id: string
  score: number
  source_lens_id: string | null
  created_at: string
  decay_curve: string | null
}

export interface LensData {
  id: string
  lens_type: string
  target_type: string | null
  target_id: string | null
  data: string
}

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
  background_type: string
  background_value: string
  sort_order: number
}

export interface WorkspacePanel {
  id: string
  workspace_id: string
  lens_type: string
  slot_name: string
  // jsonb — always a parsed object end-to-end (server, simulator, client)
  config: Record<string, unknown>
  pos_x: number
  pos_y: number
  width: number
  height: number
  z_index: number
  created_at: string
}

export interface WorkspaceScope {
  id: string
  workspace_id: string
  scope_type: string
  scope_value: string
}

export interface Scope {
  courseTag?: string
  recordingId?: string
}

// ---------------------------------------------------------------------------
// Plan items - one shared type behind Calendar, To-do and Coming up.
// ---------------------------------------------------------------------------

/** UI words: commitment = "class / commitment", deadline = "due", task = "to-do". */
export type PlanItemKind = 'commitment' | 'deadline' | 'task'
export type PlanItemStatus = 'open' | 'done' | 'dismissed'

/** v1: only commitments (classes, shifts) can repeat. */
export interface PlanItemRecurrence {
  freq: 'weekly'
  /** ISO timestamp, inclusive: the last occurrence starts at or before this. */
  until?: string
  /**
   * IANA zone whose wall clock the series follows ("every Monday 10:00
   * Europe/London" stays at 10:00 across DST). Defaults to UTC.
   */
  timeZone?: string
}

/** A stored plan item. Timestamps are ISO strings end to end. */
export interface PlanItem {
  id: string
  kind: PlanItemKind
  title: string
  starts_at: string | null
  ends_at: string | null
  due_at: string | null
  duration_min: number | null
  status: PlanItemStatus
  recurrence: PlanItemRecurrence | null
  subtype: string | null
  source_type: string | null
  source_id: string | null
  source_offset_ms: number | null
  /** The automation (workflow id) that made this item; null when a person did, or it is gone. */
  created_by_workflow_id: string | null
  /** Course tag label (e.g. 'biology'), stored as a 'plan_item' tag. */
  course: string | null
  created_at: string
  updated_at: string
}

/**
 * One row of a plan item list. For a recurring item listed with a date range,
 * each weekly occurrence is its own row: `starts_at` / `ends_at` / `due_at` are
 * that occurrence's times (render with these), while `series_*` hold the
 * stored series values. For every other row the two sets are equal.
 *
 * `id` is always the stored item, so **every mutation applies to the whole
 * series**. When editing from a row:
 * - send only the fields that changed (never echo the row back: occurrence
 *   times in a patch re-anchor the series to that week);
 * - to move or resize a recurring occurrence, shift the series by the same
 *   delta: `starts_at = series_starts_at + (newStart - starts_at)`, likewise
 *   `ends_at` from `series_ends_at`.
 *
 * `occurrence_key` is unique per row (use it as a React key).
 */
export interface PlanItemOccurrence extends PlanItem {
  occurrence_key: string
  series_starts_at: string | null
  series_ends_at: string | null
  series_due_at: string | null
}

export interface PlanItemQuery {
  /** Inclusive ISO start of the range. Give both `from` and `to` to expand recurrences. */
  from?: string
  /** Exclusive ISO end of the range. */
  to?: string
  kinds?: PlanItemKind[]
  statuses?: PlanItemStatus[]
  /** true: only items with a time block (starts_at set); false: only items without one. */
  scheduled?: boolean
  courseTag?: string
  sourceType?: string
  sourceId?: string
}

export interface NewPlanItem {
  kind: PlanItemKind
  title: string
  starts_at?: string | null
  ends_at?: string | null
  due_at?: string | null
  duration_min?: number | null
  status?: PlanItemStatus
  recurrence?: PlanItemRecurrence | null
  subtype?: string | null
  source_type?: string | null
  source_id?: string | null
  source_offset_ms?: number | null
  created_by_workflow_id?: string | null
  course?: string | null
}

/**
 * Fields to change; `null` clears a nullable field (`course: null` removes the
 * course). Applies to the stored item, i.e. the whole series for a recurring
 * one: send only changed fields (see PlanItemOccurrence).
 */
export type PlanItemPatch = Partial<NewPlanItem>

export interface PlanItemUpdate {
  id: string
  patch: PlanItemPatch
}

/**
 * How a course is going, over every lecture moment in it (all time). Moment
 * statuses follow `momentStatus` (./moments.ts), so Your progress, All
 * courses and Weak topics always agree.
 */
export interface CourseProgress {
  course: string
  totalMoments: number
  /** Moments the student feels solid on. */
  solidMoments: number
  /** Moments to look at again; Weak topics lists exactly these. */
  reviewMoments: number
  /** solidMoments / totalMoments, rounded percent. */
  percentage: number
}

/** A lecture moment that needs another look (status `review`), weakest first. */
export interface WeakTopic {
  rank: number
  segmentId: string
  recordingId: string
  recordingTitle: string
  /** Where the moment starts in the lecture. */
  offsetMs: number
  /** Short readable topic, e.g. "Maternal inheritance". */
  label: string
  course: string
  /** Latest "how sure you feel" rating (0-100), or null if never rated. */
  confidence: number | null
  /** Marked confusing (and not felt sure about since). */
  confused: boolean
}

export interface ConnectionResult {
  sourceType: string
  sourceId: string
  sourceTitle: string
  sourceDate: string
  relationship: string | null
}

export interface NewTag {
  target_type: string
  target_id: string
  label: string
}

export interface NewAnnotation {
  anchor_type: string
  anchor_id: string
  anchor_start_ms?: number
  anchor_end_ms?: number
  body: string
}

export interface NewConfidenceSignal {
  target_type: string
  target_id: string
  score: number
  source_lens_id: string
}

export interface Question {
  id: string
  conceptLabel: string
  segmentId: string
  /** Course of the lecture the question's segment comes from. */
  course: string
  question: string
  answer: string
  difficulty: 'easy' | 'medium' | 'hard'
}

