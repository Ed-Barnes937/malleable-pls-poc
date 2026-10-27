import type { PlanItemOccurrence, PlanItemQuery } from '@pls/substrate'
import { dayLabel, localDayKey, startOfLocalDay } from '@pls/shared-ui'

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
  /** Deadlines from before today, still open: one calm group, not a pile of days. */
  past: boolean
  items: PlanItemOccurrence[]
}

export const EARLIER_KEY = 'earlier'

/**
 * Deadlines grouped by local due day, soonest first. Open deadlines from
 * before today share a single "Still to do from earlier (N)" group at the top,
 * most recent first, rather than one heading per missed day. An all-day
 * deadline (local 00:00, see `isAllDay`) belongs to its own date.
 */
export function groupByDay(items: PlanItemOccurrence[], now: number): DayGroup[] {
  const today = localDayKey(now)
  const dated = items.filter((item) => item.due_at).sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))
  const earlier = dated.filter((item) => localDayKey(item.due_at!) < today).reverse()

  const groups: DayGroup[] = []
  if (earlier.length > 0) {
    groups.push({ key: EARLIER_KEY, past: true, heading: `Still to do from earlier (${earlier.length})`, items: earlier })
  }
  const byDay = new Map<string, DayGroup>()
  for (const item of dated) {
    const key = localDayKey(item.due_at!)
    if (key < today) continue
    let group = byDay.get(key)
    if (!group) {
      group = { key, past: false, heading: dayLabel(item.due_at!, now), items: [] }
      byDay.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}

/** Linked to the given lecture (provenance `source_type = 'recording'`). */
export function isFromRecording(item: PlanItemOccurrence, recordingId: string | undefined): boolean {
  return !!recordingId && item.source_type === 'recording' && item.source_id === recordingId
}
