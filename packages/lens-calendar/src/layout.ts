import type { PlanItemOccurrence } from '@pls/substrate'
import { isAllDay } from '@pls/shared-ui'
import { MINUTES_PER_DAY, addDays, sameDay, startOfDay, wallMinutes } from './time'

/** One day's slice of a timed block, laid out side by side with overlaps. */
export interface DaySegment {
  /** Unique per occurrence and day. */
  key: string
  item: PlanItemOccurrence
  dayIndex: number
  /** Minutes since that day's midnight, clipped to the day. */
  startMin: number
  endMin: number
  /** The block started on an earlier day / runs into a later one. */
  continuesBefore: boolean
  continuesAfter: boolean
  /** Side-by-side position among overlapping blocks. */
  column: number
  columns: number
}

/** Something due, shown in the all-day row and as a marker at its time. */
export interface DueMarker {
  key: string
  item: PlanItemOccurrence
  dayIndex: number
  minute: number
  /** Due at local 00:00: the shared convention for "due that day" (`isAllDay`), no time. */
  allDay: boolean
}

/** Whether a row is drawn as a block in the time grid. */
export function isTimed(item: PlanItemOccurrence): boolean {
  return item.starts_at != null && item.ends_at != null
}

/** Only scheduled study time moves by drag; a commitment moves by explicit edit. */
export function isMovable(item: PlanItemOccurrence): boolean {
  return item.kind === 'task' && isTimed(item) && item.status === 'open'
}

/**
 * Splits timed rows into per-day segments and assigns overlap columns, so
 * clashing blocks sit side by side instead of hiding each other.
 */
export function layoutDays(items: PlanItemOccurrence[], days: Date[]): DaySegment[][] {
  const perDay: DaySegment[][] = days.map(() => [])
  for (const item of items) {
    if (!isTimed(item)) continue
    const start = new Date(item.starts_at!)
    const end = new Date(item.ends_at!)
    days.forEach((day, dayIndex) => {
      const dayStart = startOfDay(day).getTime()
      const nextDay = addDays(day, 1).getTime()
      if (end.getTime() <= dayStart || start.getTime() >= nextDay) return
      // Wall-clock minutes, matching the grid's hour labels on DST days too.
      const continuesBefore = start.getTime() < dayStart
      const continuesAfter = end.getTime() > nextDay
      perDay[dayIndex].push({
        key: `${item.occurrence_key}:${dayIndex}`,
        item,
        dayIndex,
        startMin: continuesBefore ? 0 : wallMinutes(start),
        endMin: continuesAfter || end.getTime() === nextDay ? MINUTES_PER_DAY : wallMinutes(end),
        continuesBefore,
        continuesAfter,
        column: 0,
        columns: 1,
      })
    })
  }
  for (const segments of perDay) assignColumns(segments)
  return perDay
}

/** Greedy column packing within each cluster of transitively overlapping segments. */
function assignColumns(segments: DaySegment[]): void {
  segments.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.key.localeCompare(b.key))
  let cluster: DaySegment[] = []
  let columnEnds: number[] = []
  let clusterEnd = -Infinity

  const close = () => {
    for (const s of cluster) s.columns = columnEnds.length
    cluster = []
    columnEnds = []
  }

  for (const seg of segments) {
    if (seg.startMin >= clusterEnd) close()
    let column = columnEnds.findIndex((end) => end <= seg.startMin)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(seg.endMin)
    } else {
      columnEnds[column] = seg.endMin
    }
    seg.column = column
    cluster.push(seg)
    clusterEnd = Math.max(clusterEnd, seg.endMin)
  }
  close()
}

/**
 * Due rows per day: deadlines only. A to-do's due date is part of the to-do
 * (its popover, the To-do widget, Help me plan), not a marker of its own.
 */
export function dueMarkers(items: PlanItemOccurrence[], days: Date[]): DueMarker[][] {
  const perDay: DueMarker[][] = days.map(() => [])
  for (const item of items) {
    if (item.kind !== 'deadline' || isTimed(item) || item.due_at == null) continue
    const due = new Date(item.due_at)
    const dayIndex = days.findIndex((d) => sameDay(d, due))
    if (dayIndex === -1) continue
    const minute = wallMinutes(due)
    perDay[dayIndex].push({ key: item.occurrence_key, item, dayIndex, minute, allDay: isAllDay(due) })
  }
  for (const markers of perDay) markers.sort((a, b) => a.minute - b.minute)
  return perDay
}
