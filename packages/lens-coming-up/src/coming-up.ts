import type { PlanItemOccurrence, PlanItemQuery } from '@pls/substrate'
import { dayLabel, localDayKey, startOfLocalDay, stillToDoLabel } from '@pls/shared-ui'

export const DEFAULT_LOOK_AHEAD_DAYS = 14
export const LOOK_AHEAD_OPTIONS = [7, 14, 30]

/**
 * Open deadlines still to do from earlier are always shown, however old, so
 * the range starts well before any real plan item.
 */
const OPEN_SINCE = '2000-01-01T00:00:00.000Z'

/** The panel's look-ahead knob (layer-2 config), falling back to 14 days. */
export function lookAheadDays(config: Record<string, unknown>): number {
  const days = config.lookAheadDays
  return typeof days === 'number' && Number.isInteger(days) && days > 0 && days <= 366 ? days : DEFAULT_LOOK_AHEAD_DAYS
}

/**
 * Open deadlines from any time in the past up to the end of the last
 * look-ahead day. Anchored to local midnight, so the query (and its cache
 * key) only changes once a day.
 */
export function comingUpQuery(days: number, now: number, courseTag?: string): PlanItemQuery {
  const end = startOfLocalDay(now)
  end.setDate(end.getDate() + days + 1)
  return { kinds: ['deadline'], statuses: ['open'], from: OPEN_SINCE, to: end.toISOString(), courseTag }
}

export interface DayGroup {
  key: string
  heading: string
  /** The day is before today: its deadlines are still to do. */
  past: boolean
  items: PlanItemOccurrence[]
}

/** Deadlines grouped by local due day, earliest first. */
export function groupByDay(items: PlanItemOccurrence[], now: number): DayGroup[] {
  const today = localDayKey(now)
  const groups = new Map<string, DayGroup>()
  const sorted = [...items].filter((item) => item.due_at).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))
  for (const item of sorted) {
    const key = localDayKey(item.due_at!)
    let group = groups.get(key)
    if (!group) {
      const past = key < today
      group = { key, past, heading: past ? stillToDoLabel(item.due_at!, now) : dayLabel(item.due_at!, now), items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
}
