/**
 * Pure plan item logic shared by the server router and the CT backend
 * simulator, so both list, validate and expand recurrences identically.
 * No DB, no clock.
 */
import type { NewPlanItem, PlanItem, PlanItemOccurrence, PlanItemQuery } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** Upper bound on occurrences expanded per item per list call. */
export const MAX_OCCURRENCES_PER_ITEM = 520

type ShapeFields = Pick<NewPlanItem, 'kind' | 'starts_at' | 'ends_at' | 'due_at' | 'duration_min' | 'recurrence'>

/**
 * Checks the per-kind shape rules (mirrors the table's CHECK constraints).
 * Returns a human-readable reason, or null when valid.
 */
export function validatePlanItem(item: ShapeFields): string | null {
  const hasStart = item.starts_at != null
  const hasEnd = item.ends_at != null
  if (hasStart !== hasEnd) return 'starts_at and ends_at must be set together'
  if (hasStart && Date.parse(item.ends_at!) <= Date.parse(item.starts_at!)) {
    return 'ends_at must be after starts_at'
  }
  if (item.kind === 'commitment' && !hasStart) return 'a commitment needs starts_at and ends_at'
  if (item.kind === 'deadline' && item.due_at == null) return 'a deadline needs due_at'
  if (item.duration_min != null && item.duration_min <= 0) return 'duration_min must be positive'
  if (item.recurrence != null) {
    if (item.recurrence.freq !== 'weekly') return 'only weekly recurrence is supported'
    if (item.kind !== 'commitment') return 'only commitments can repeat'
    if (!hasStart) return 'a recurring item needs starts_at and ends_at'
    if (item.recurrence.until != null && Date.parse(item.recurrence.until) < Date.parse(item.starts_at!)) {
      return 'recurrence until must not be before starts_at'
    }
    if (item.recurrence.timeZone && !isValidTimeZone(item.recurrence.timeZone)) {
      return `unknown time zone: ${item.recurrence.timeZone}`
    }
  }
  return null
}

/** Non-date filters (kind, status, course, source). The server does these in SQL. */
export function matchesPlanItemFilters(item: PlanItem, query: PlanItemQuery): boolean {
  if (query.kinds?.length && !query.kinds.includes(item.kind)) return false
  if (query.statuses?.length && !query.statuses.includes(item.status)) return false
  if (query.scheduled != null && (item.starts_at != null) !== query.scheduled) return false
  if (query.courseTag && item.course !== query.courseTag) return false
  if (query.sourceType && item.source_type !== query.sourceType) return false
  if (query.sourceId && item.source_id !== query.sourceId) return false
  return true
}

/**
 * Turns stored items into list rows. Without a full range, each item is one
 * row as stored. With `from` and `to`, weekly recurrences are expanded into
 * their occurrences, and only rows that fall in [from, to) are kept: a row
 * matches when its [starts_at, ends_at) span overlaps the range or its due_at
 * is inside it. Undated items (e.g. an unscheduled to-do with no due date) are
 * left out of ranged lists. Rows are sorted by start (or due) time.
 */
export function expandPlanItems(items: PlanItem[], range: Pick<PlanItemQuery, 'from' | 'to'> = {}): PlanItemOccurrence[] {
  const rows: PlanItemOccurrence[] = []
  if (!range.from || !range.to) {
    for (const item of items) rows.push(asRow(item))
    return rows.sort(compareRows)
  }

  const from = Date.parse(range.from)
  const to = Date.parse(range.to)
  for (const item of items) {
    if (item.recurrence) {
      rows.push(...weeklyOccurrences(item, from, to))
    } else if (inRange(item, from, to)) {
      rows.push(asRow(item))
    }
  }
  return rows.sort(compareRows)
}

function asRow(item: PlanItem): PlanItemOccurrence {
  return {
    ...item,
    occurrence_key: item.id,
    series_starts_at: item.starts_at,
    series_ends_at: item.ends_at,
    series_due_at: item.due_at,
  }
}

function inRange(item: Pick<PlanItem, 'starts_at' | 'ends_at' | 'due_at'>, from: number, to: number): boolean {
  if (item.starts_at && item.ends_at) {
    if (Date.parse(item.starts_at) < to && Date.parse(item.ends_at) > from) return true
  }
  if (item.due_at) {
    const due = Date.parse(item.due_at)
    if (due >= from && due < to) return true
  }
  return false
}

/**
 * Weekly occurrences of `item` that fall in [from, to). Each occurrence keeps
 * the series' local wall-clock time in its time zone, so a 10:00 class is at
 * 10:00 on both sides of a DST change. Duration is kept in elapsed time.
 *
 * Edge cases accepted in v1: the loop stops at the first occurrence starting
 * at or after `to`, so a due_at set *before* its occurrence's start can miss a
 * range that ends between the two; and the server's SQL prefilter assumes an
 * occurrence lasts under 7 days.
 */
function weeklyOccurrences(item: PlanItem, from: number, to: number): PlanItemOccurrence[] {
  const recurrence = item.recurrence!
  const tz = recurrence.timeZone ?? 'UTC'
  const start = Date.parse(item.starts_at!)
  const length = Date.parse(item.ends_at!) - start
  const until = recurrence.until ? Date.parse(recurrence.until) : Infinity
  const dueOffset = item.due_at ? Date.parse(item.due_at) - start : null

  const startWall = wallClock(start, tz)
  // Skip straight to the week before `from`; DST shifts are at most a few
  // hours, so one week of slack is plenty.
  const firstWeek = Math.max(0, Math.floor((from - start - length) / WEEK_MS) - 1)

  const rows: PlanItemOccurrence[] = []
  for (let week = firstWeek, n = 0; n < MAX_OCCURRENCES_PER_ITEM; week++, n++) {
    const occStart = fromWallClock(startWall + week * WEEK_MS, tz)
    if (occStart >= to || occStart > until) break
    const occ = {
      starts_at: new Date(occStart).toISOString(),
      ends_at: new Date(occStart + length).toISOString(),
      due_at: dueOffset == null ? null : new Date(occStart + dueOffset).toISOString(),
    }
    if (inRange(occ, from, to)) {
      rows.push({ ...asRow(item), ...occ, occurrence_key: `${item.id}@${occ.starts_at}` })
    }
  }
  return rows
}

function compareRows(a: PlanItemOccurrence, b: PlanItemOccurrence): number {
  const ta = a.starts_at ?? a.due_at ?? a.created_at
  const tb = b.starts_at ?? b.due_at ?? b.created_at
  return Date.parse(ta) - Date.parse(tb) || a.occurrence_key.localeCompare(b.occurrence_key)
}

// ---------------------------------------------------------------------------
// Time zone helpers (Intl only, no library)
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz)
    return true
  } catch {
    return false
  }
}

/**
 * Moves `instant` by the wall-clock difference between `from` and `to` in
 * `tz`, e.g. to shift a weekly series by how far one of its occurrences was
 * moved. Unlike adding `to - from` in ms, a move across a DST change keeps
 * the series at the intended local time (Sat 10:00 BST to Sun 10:00 GMT is
 * "one day later, same time", not 25 hours).
 */
export function shiftByWallClock(instant: number, from: number, to: number, tz: string): number {
  return fromWallClock(wallClock(instant, tz) + (wallClock(to, tz) - wallClock(from, tz)), tz)
}

/** The local wall-clock time of `instant` in `tz`, encoded as if it were UTC. */
function wallClock(instant: number, tz: string): number {
  const parts: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(new Date(instant))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const wholeSeconds = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return wholeSeconds + (((instant % 1000) + 1000) % 1000)
}

/**
 * The instant whose wall-clock time in `tz` is `wall`. For a wall time that
 * doesn't exist (inside a spring-forward gap) this lands just after the gap;
 * for an ambiguous one (fall-back) it picks one of the two instants.
 */
function fromWallClock(wall: number, tz: string): number {
  const guess = wall - (wallClock(wall, tz) - wall)
  return wall - (wallClock(guess, tz) - guess)
}
