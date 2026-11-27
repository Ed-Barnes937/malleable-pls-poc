/**
 * Sessions: a to-do too long for one block is booked as a few study blocks
 * (flow-audit decision 1). Each session is its own plan item (kind `task`,
 * with a time block) linked to its to-do through the provenance fields:
 * `source_type = 'plan_item'`, `source_id = <to-do id>`. The to-do itself
 * stays unscheduled, keeps its total estimate (`duration_min`) and is ticked
 * off once; ticking it, dismissing it or deleting it does the same to its
 * open sessions (and a new title, course or due time carries over), while a
 * session can still be ticked on its own. A to-do's booked time is the sum
 * of its sessions' lengths (`bookedMinutes`). Each session fires its own plan-item workflow
 * events when it is changed directly; changes cascaded from the to-do fire
 * none.
 *
 * A to-do booked in one block is unchanged: its own row carries the time,
 * and its booked time is that block's length (resizing the block never
 * changes the estimate, flow-audit decision 8). It becomes sessions only when
 * a second booking is needed: creating a session for a to-do that has its
 * own block first moves that block into a session of its own, so every
 * booked piece can be ticked on its own.
 */
import type { NewPlanItem, PlanItem } from './types'

export const SESSION_SOURCE_TYPE = 'plan_item'

/**
 * The `subtype` of a session that was closed because its to-do was ticked
 * off or dismissed (not by the student ticking the session itself), so
 * reopening the to-do reopens exactly those. Cleared when it reopens, or when
 * the session's own status is changed directly.
 */
export const CLOSED_WITH_TODO = 'closed-with-to-do'

/** Auto-fill never splits a to-do into sessions shorter than this. */
export const MIN_SESSION_MIN = 30

type Provenance = Pick<PlanItem, 'kind' | 'source_type' | 'source_id'>

/** The to-do a session belongs to, or null when `item` is not a session. */
export function sessionParentId(item: Provenance): string | null {
  return item.kind === 'task' && item.source_type === SESSION_SOURCE_TYPE && item.source_id ? item.source_id : null
}

export function isSession(item: Provenance): boolean {
  return sessionParentId(item) !== null
}

/**
 * A to-do of the student's own (no source: not a session, not a review of a
 * lecture moment). Only its own block counts as booked time towards its
 * estimate, and only it is turned into sessions on a second booking. Anything
 * with a source keeps its block as its booking: a review's estimate is its
 * block, and its block stays linked to its moment.
 */
export function isPlainTodo(item: Pick<PlanItem, 'kind' | 'source_type'>): boolean {
  return item.kind === 'task' && item.source_type == null
}

type Booking = Provenance & Pick<PlanItem, 'id' | 'status' | 'starts_at' | 'ends_at'> & Partial<Pick<PlanItem, 'recurrence'>>

/**
 * Booked minutes per to-do id: its sessions' lengths, plus its own block when
 * it is booked in one (a one-off task row with a time). Dismissed rows don't
 * count; done ones do.
 */
export function bookedMinutes(rows: ReadonlyArray<Booking>): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of rows) {
    if (row.kind !== 'task' || row.status === 'dismissed' || !row.starts_at || !row.ends_at) continue
    const owner = sessionParentId(row) ?? (isPlainTodo(row) && !row.recurrence ? row.id : null)
    if (!owner) continue
    const min = (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000
    out.set(owner, (out.get(owner) ?? 0) + min)
  }
  return out
}

/**
 * "1h of 2h booked": a to-do with an estimate that is booked for some of it
 * but not all, or null (nothing booked, all of it booked, or no estimate).
 * `duration_min` is the to-do's total, as stored.
 */
export function partBooking(
  todo: Pick<PlanItem, 'id' | 'duration_min'>,
  booked: ReadonlyMap<string, number>,
): { bookedMin: number; totalMin: number; restMin: number } | null {
  const done = booked.get(todo.id) ?? 0
  const total = todo.duration_min
  if (total == null || done <= 0 || done >= total) return null
  return { bookedMin: done, totalMin: total, restMin: total - done }
}

/**
 * The to-dos still to plan, given what is already booked (`bookedMinutes`):
 * a to-do with booked time is planned only for the time not booked yet
 * (`duration_min` is what is left), and drops out once it is all booked.
 * Others pass through. Pass every open to-do, with or without a time.
 */
export function todosToPlan<T extends Pick<PlanItem, 'id' | 'duration_min'> & Partial<Pick<PlanItem, 'starts_at'>>>(
  todos: ReadonlyArray<T>,
  booked: ReadonlyMap<string, number>,
): T[] {
  const out: T[] = []
  for (const todo of todos) {
    const done = booked.get(todo.id)
    // A row with a time that books nothing (a repeating one) isn't waiting for one.
    if (!done && todo.starts_at) continue
    if (!done) out.push(todo)
    else if (todo.duration_min != null && todo.duration_min > done) out.push({ ...todo, duration_min: todo.duration_min - done })
  }
  return out
}

/** The new plan item for one session of `todo`, from `start` to `end` (ISO). */
export function newSession(
  todo: Pick<PlanItem, 'id' | 'title' | 'course' | 'due_at'>,
  start: string,
  end: string,
): NewPlanItem {
  return {
    kind: 'task',
    title: todo.title,
    course: todo.course,
    // Carried so re-fitting a missed session still ends by the due time.
    due_at: todo.due_at,
    starts_at: start,
    ends_at: end,
    duration_min: Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
    source_type: SESSION_SOURCE_TYPE,
    source_id: todo.id,
  }
}
