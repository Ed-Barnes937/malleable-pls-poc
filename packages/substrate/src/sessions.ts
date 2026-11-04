/**
 * Sessions: a to-do too long for one block is booked as a few study blocks
 * (flow-audit decision 1). Each session is its own plan item (kind `task`,
 * with a time block) linked to its to-do through the provenance fields:
 * `source_type = 'plan_item'`, `source_id = <to-do id>`. The to-do itself
 * stays unscheduled, keeps its total estimate (`duration_min`) and is ticked
 * off once; ticking it, dismissing it or deleting it does the same to its
 * sessions. A to-do's booked time is the sum of its sessions' lengths.
 *
 * A to-do booked in one block is unchanged: its own row carries the time.
 */
import type { NewPlanItem, PlanItem } from './types'

export const SESSION_SOURCE_TYPE = 'plan_item'

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

/** Booked minutes per to-do id, from session rows (dismissed ones don't count). */
export function bookedMinutes(
  rows: ReadonlyArray<Provenance & Pick<PlanItem, 'status' | 'starts_at' | 'ends_at'>>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of rows) {
    const parent = sessionParentId(row)
    if (!parent || row.status === 'dismissed' || !row.starts_at || !row.ends_at) continue
    const min = (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000
    out.set(parent, (out.get(parent) ?? 0) + min)
  }
  return out
}

/**
 * The to-dos still to plan, given the sessions already booked: a to-do with
 * sessions is planned only for the time not booked yet (`duration_min` is
 * what is left), and drops out once it is all booked. Others pass through.
 */
export function todosToPlan<T extends Pick<PlanItem, 'id' | 'duration_min'>>(
  todos: ReadonlyArray<T>,
  booked: ReadonlyMap<string, number>,
): T[] {
  const out: T[] = []
  for (const todo of todos) {
    const done = booked.get(todo.id)
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
