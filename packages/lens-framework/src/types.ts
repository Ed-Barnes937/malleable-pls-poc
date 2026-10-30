/**
 * Workspace-level ("board") scope shared by every widget on a board. Each
 * widget declares per dimension how it responds (see `ScopeDeclaration`); the
 * shell splits the board scope accordingly (see `LensProps`).
 */
export interface Scope {
  courseTag?: string
  /**
   * The selected lecture (`lectures.id`). Invariant, enforced by the server:
   * when set, `courseTag` is that lecture's course (unset for a lecture filed
   * under none).
   */
  lectureId?: string
}

export type ScopeDim = keyof Scope

/**
 * How a widget responds to the board's course.
 * - `filter`: readers narrow to the course; the widget says what it leaves
 *   out ("+N in other courses"). Anything the widget creates inherits the
 *   course (e.g. audio capture files a new lecture under it).
 * - `highlight`: shows everything and emphasises the course (dims the rest,
 *   never hides it). The course never reaches the widget's readers.
 * - `ignore`: never sees the course.
 */
export type CourseScopeMode = 'filter' | 'highlight' | 'ignore'

/**
 * How a widget responds to the board's selected lecture.
 * - `target`: works on that one lecture (its recordings, transcript,
 *   connections) and prompts when none is selected. The lecture is always in
 *   the board course, so the two never disagree.
 * - `highlight`: shows everything and emphasises items linked to it (e.g.
 *   blocks made from its moments). The lecture never reaches the widget's
 *   readers.
 * - `ignore`: never sees the lecture.
 */
export type LectureScopeMode = 'target' | 'highlight' | 'ignore'

/**
 * Per-dimension scope behaviour declared on a widget's manifest. Omitted
 * dimensions are `ignore`. Scope controls what a widget shows, never what is
 * true: e.g. a course-highlighting calendar still schedules around other
 * courses.
 */
export interface ScopeDeclaration {
  courseTag?: CourseScopeMode
  lectureId?: LectureScopeMode
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

/** A point in a recording, e.g. the lecture moment a review to-do came from. */
export interface Moment {
  recordingId: string
  /** Offset from the start of the recording, in milliseconds. */
  offsetMs: number
}

/**
 * The moment most recently asked to be shown (see `LensProps.onShowMoment`).
 * Ephemeral shell state, never persisted. `id` is new on every request, so
 * showing the same moment twice scrolls to it again.
 */
export interface FocusedMoment extends Moment {
  id: number
  /** Move keyboard focus to the moment as well (the shell switched boards to show it). */
  takeFocus?: boolean
}

/**
 * - `shown`: a widget that shows moments (manifest `showsMoments`) is on the
 *   board it was shown on: this one, or another board the shell switched to.
 * - `no-viewer`: no board has such a widget. The recording is still focused
 *   on this board.
 */
export type ShowMomentResult = 'shown' | 'no-viewer'

/** A scheduled plan item to show, e.g. the review block the confusion automation just placed. */
export interface PlanItemRef {
  id: string
  /** Its block's start (ISO), so a viewer can open the right week. */
  startsAt: string
  /**
   * Where the request came from (e.g. the review chip on the marked moment):
   * kept in view with the block when both fit on screen.
   */
  keepInView?: Element | null
  /**
   * The block glows this many ms after the request, not straight away: a
   * card flying from the moment lands on it then.
   */
  landsInMs?: number
  /**
   * The student's own board scrolling since this mark (`watchUserScroll`,
   * e.g. when they marked the moment) leaves the board where they put it.
   * Defaults to the time of the request.
   */
  scrolledSince?: number
}

/**
 * The plan item most recently asked to be shown (see
 * `LensProps.onShowPlanItem`). Ephemeral shell state; `requestId` is new on
 * every request, so showing the same block twice reveals it again.
 */
export interface FocusedPlanItem extends PlanItemRef {
  requestId: number
  /**
   * When it was asked for (a `watchUserScroll()` mark), or `scrolledSince`
   * when earlier: if the student scrolls the board after this, the viewer
   * leaves the board where they put it.
   */
  requestedAt: number
}

export interface LensProps {
  panelId: string
  /**
   * The board dimensions this widget declares `filter` or `target`. Safe to
   * pass straight to substrate readers: it never contains a dimension the
   * widget only highlights.
   */
  scope: Scope
  /**
   * The board dimensions this widget declares `highlight`. For styling only
   * (emphasise in-scope items, dim the rest); never pass it to readers, or
   * the widget would hide what it is meant to show. Optional because hosts
   * such as component tests may not supply it.
   */
  highlight?: Scope
  config: Record<string, unknown>
  /**
   * Patch the panel's persisted config. Shallow-merged with current config.
   * Optional because not all hosts (e.g. component tests) wire it up.
   */
  onConfigChange?: (patch: Record<string, unknown>) => void
  /**
   * Patch the workspace-level scope shared by every panel, e.g. to select a
   * lecture the lens just created. `undefined` clears a dimension. The shell
   * writes it in one atomic `setBoardScope`, so the server's rules apply: a
   * lecture brings its course, a course change clears a lecture outside it.
   * The shell's promise says whether the write went through (it never
   * rejects), for a widget that must undo what it showed when it didn't.
   * Optional for the same reason as `onConfigChange`.
   */
  onScopeChange?: (patch: Partial<Scope>) => void | Promise<boolean>
  /**
   * Jump to a recording moment ("click a study block, land on the lecture
   * moment"): the shell selects the recording's lecture on the board (which
   * brings its course, as `onScopeChange` would) and hands the moment to every widget whose manifest
   * declares `showsMoments` via `focusedMoment`. When this board has none, the
   * shell opens the moment on a board that does (with a toast offering the way
   * back); `no-viewer` means no board has one. Optional
   * for the same reason as `onConfigChange`.
   */
  onShowMoment?: (moment: Moment) => Promise<ShowMomentResult>
  /**
   * For widgets that declare `showsMoments`: the moment last asked to be
   * shown, on any board. Scroll to and highlight it once it belongs to the
   * recording the widget shows; act once per `id`, then call
   * `onMomentShown(id)` so the shell drops it (a later remount, e.g. on
   * another board, then doesn't jump there again).
   */
  focusedMoment?: FocusedMoment
  /** For `showsMoments` widgets: the moment with this `id` has been shown. */
  onMomentShown?: (id: number) => void
  /**
   * Reveal a scheduled block ("Review planned · Wed 19:30" -> the block on
   * the calendar): the shell hands it to every widget on the board whose
   * manifest declares `showsPlanItems` via `focusedPlanItem`. Returns false
   * when the board has none. Optional for the same reason as `onConfigChange`.
   */
  onShowPlanItem?: (item: PlanItemRef) => boolean
  /**
   * For widgets that declare `showsPlanItems`: the block last asked to be
   * shown. Bring it into view and highlight it once, then call
   * `onPlanItemShown(requestId)` so the shell drops it.
   */
  focusedPlanItem?: FocusedPlanItem
  /** For `showsPlanItems` widgets: the request with this id has been shown. */
  onPlanItemShown?: (requestId: number) => void
  /**
   * Open the automation with this id (a workflow id, e.g. a plan item's
   * `created_by_workflow_id`) so the student can see and edit it. Optional
   * for the same reason as `onConfigChange`.
   */
  onEditAutomation?: (workflowId: string) => void
}
