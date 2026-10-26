/**
 * Workspace-level ("board") scope shared by every widget on a board. Each
 * widget declares per dimension how it responds (see `ScopeDeclaration`); the
 * shell only hands a widget the dimensions it declares.
 */
export interface Scope {
  courseTag?: string
  recordingId?: string
}

export type ScopeDim = keyof Scope

/**
 * How a widget responds to the board's course.
 * - `filter`: shows only in-course data and says what it leaves out
 *   ("+N in other courses"). Anything the widget creates inherits the course.
 * - `highlight`: shows everything and emphasises the course (dims the rest,
 *   never hides it).
 * - `label`: shows nothing differently, but uses the course for what it
 *   creates (e.g. audio capture files a new lecture under it).
 * - `ignore`: never sees the course.
 */
export type CourseScopeMode = 'filter' | 'highlight' | 'label' | 'ignore'

/**
 * How a widget responds to the board's focused recording ("lecture").
 * - `target`: works on that one recording (and prompts when none is focused).
 * - `highlight`: shows everything and emphasises items linked to it.
 * - `ignore`: never sees the focus.
 */
export type RecordingScopeMode = 'target' | 'highlight' | 'ignore'

/**
 * Per-dimension scope behaviour declared on a widget's manifest. Omitted
 * dimensions are `ignore`. Scope controls what a widget shows, never what is
 * true: e.g. a course-highlighting calendar still schedules around other
 * courses.
 */
export interface ScopeDeclaration {
  courseTag?: CourseScopeMode
  recordingId?: RecordingScopeMode
}

/**
 * Inclusive-exclusive window of time, as ISO-8601 instants. Not a board-level
 * dimension: widgets own their own date navigation and look-ahead (a calendar
 * shows the week being viewed, Coming up looks 14 days ahead) and pass the
 * range to readers alongside the board scope.
 */
export interface DateRange {
  /** Inclusive start. */
  from: string
  /** Exclusive end. */
  to: string
}

export interface LensProps {
  panelId: string
  /** The board scope, narrowed to the dimensions this widget declares. */
  scope: Scope
  config: Record<string, unknown>
  /**
   * Patch the panel's persisted config. Shallow-merged with current config.
   * Optional because not all hosts (e.g. component tests) wire it up.
   */
  onConfigChange?: (patch: Record<string, unknown>) => void
  /**
   * Patch the workspace-level scope shared by every panel, e.g. to focus a
   * recording the lens just created. `undefined` clears a dimension. Optional
   * for the same reason as `onConfigChange`.
   */
  onScopeChange?: (patch: Partial<Scope>) => void
}
