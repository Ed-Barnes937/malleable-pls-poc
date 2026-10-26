import type { PlanItemOccurrence } from '@pls/substrate'
import { localDayKey } from '@pls/shared-ui'

/**
 * When a to-do is "for": its scheduled block if placed, else its due date.
 * Null for an undated to-do.
 */
export function whenOf(item: PlanItemOccurrence): string | null {
  return item.starts_at ?? item.due_at
}

/**
 * List order: dated to-dos first, soonest first (anything still to do from
 * earlier naturally leads), then undated ones in the order they were added,
 * so a quick-added to-do lands at the bottom, right above the add field.
 */
export function orderTodos(items: PlanItemOccurrence[]): PlanItemOccurrence[] {
  return [...items].sort((a, b) => {
    const wa = whenOf(a)
    const wb = whenOf(b)
    if (wa && wb) return Date.parse(wa) - Date.parse(wb) || a.id.localeCompare(b.id)
    if (wa) return -1
    if (wb) return 1
    return Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)
  })
}

/**
 * The moment an open to-do slipped into the past, or null if it hasn't: a
 * scheduled block that has ended, or a due date that has passed.
 */
export function slippedAt(item: PlanItemOccurrence, now: number): string | null {
  if (item.starts_at) {
    const end = item.ends_at ?? item.starts_at
    return Date.parse(end) < now ? item.starts_at : null
  }
  if (item.due_at && Date.parse(item.due_at) < now) return item.due_at
  return null
}

/** Done to-dos worth showing again: those ticked off today. */
export function doneToday(items: PlanItemOccurrence[], now: number): PlanItemOccurrence[] {
  const today = localDayKey(now)
  return items
    .filter((item) => item.status === 'done' && localDayKey(item.updated_at) === today)
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
}
