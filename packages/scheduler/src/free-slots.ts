import { MINUTE_MS, normalize, subtract, type Interval } from './intervals'
import { parseTimeOfDay, wallClock, zonedTimeToUtc } from './time'

export interface FreeSlotPrefs {
  /** IANA time zone the day start/end are read in. Default `'UTC'`. */
  timeZone?: string
  /** Local time the study day starts, `"HH:MM"`. Default `'08:00'`. */
  dayStart?: string
  /**
   * Local time the study day ends, `"HH:MM"` (`'24:00'` allowed). Default
   * `'22:00'`. An end at or before the start means the day runs past
   * midnight (e.g. `'18:00'`-`'02:00'`).
   */
  dayEnd?: string
  /** Free gaps shorter than this are dropped. Default 15. */
  minSlotMin?: number
  /** Kept clear before and after every commitment. Default 0. */
  bufferMin?: number
}

export const DEFAULT_FREE_SLOT_PREFS: Required<FreeSlotPrefs> = {
  timeZone: 'UTC',
  dayStart: '08:00',
  dayEnd: '22:00',
  minSlotMin: 15,
  bufferMin: 0,
}

function nonNegative(name: string, value: number): number {
  if (!(value >= 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number >= 0, got ${value}`)
  }
  return value
}

/**
 * The local study-day windows (`dayStart`-`dayEnd` in `timeZone`) that
 * intersect `range`, clipped to it. DST-safe: each window is computed from
 * its own local date, so a 08:00 start stays 08:00 local across transitions.
 */
export function dayWindows(range: Interval, prefs: FreeSlotPrefs = {}): Interval[] {
  const p = { ...DEFAULT_FREE_SLOT_PREFS, ...prefs }
  const startMin = parseTimeOfDay(p.dayStart)
  const endMin = parseTimeOfDay(p.dayEnd)
  const overnight = endMin <= startMin ? 1 : 0
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new RangeError('range start and end must be finite UTC ms values')
  }
  const out: Interval[] = []
  if (!(range.end > range.start)) return out
  const first = wallClock(range.start, p.timeZone)
  // Start one local day early so a window that began yesterday evening and
  // runs past midnight is included.
  for (let i = -1; ; i++) {
    const day = first.day + i
    const start = zonedTimeToUtc(first.year, first.month, day, startMin, p.timeZone)
    if (start >= range.end) break
    const end = zonedTimeToUtc(first.year, first.month, day + overnight, endMin, p.timeZone)
    out.push({ start: Math.max(start, range.start), end: Math.min(end, range.end) })
  }
  return normalize(out)
}

/**
 * Free time inside `range`: the study-day windows minus every commitment
 * (padded by `bufferMin` on both sides), keeping only gaps of at least
 * `minSlotMin`. Commitments are plain intervals; callers expand recurrences
 * and pass anything that blocks time (classes, shifts, accepted study blocks
 * if they want them treated as fixed).
 */
export function freeSlots(
  commitments: ReadonlyArray<Interval>,
  range: Interval,
  prefs: FreeSlotPrefs = {},
): Interval[] {
  const p = { ...DEFAULT_FREE_SLOT_PREFS, ...prefs }
  const bufferMs = nonNegative('bufferMin', p.bufferMin) * MINUTE_MS
  const minMs = nonNegative('minSlotMin', p.minSlotMin) * MINUTE_MS
  const busy = normalize(commitments).map((c) => ({ start: c.start - bufferMs, end: c.end + bufferMs }))
  return subtract(dayWindows(range, p), busy).filter((s) => s.end - s.start >= minMs)
}
