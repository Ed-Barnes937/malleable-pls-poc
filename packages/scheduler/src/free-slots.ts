import { MINUTE_MS, normalize, subtract, type Interval } from './intervals'
import { parseTimeOfDay, wallClock, zonedTimeToUtc } from './time'

/** One local day's study window, `"HH:MM"` each (see `FreeSlotPrefs.dayStart`/`dayEnd`). */
export interface DayWindow {
  dayStart: string
  dayEnd: string
}

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
  /**
   * Per-weekday windows, used instead of `dayStart`/`dayEnd` when set:
   * exactly 7 entries, index 0 = Monday ... 6 = Sunday (local). `null` means
   * no window that day, so no free time. A window belongs to the local day it
   * starts on, so an overnight Friday window is Friday's.
   */
  days?: ReadonlyArray<DayWindow | null>
  /** Free gaps shorter than this are dropped. Default 15. */
  minSlotMin?: number
  /** Kept clear before and after every commitment. Default 0. */
  bufferMin?: number
}

export const DEFAULT_FREE_SLOT_PREFS: Required<Omit<FreeSlotPrefs, 'days'>> = {
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

interface MinutesWindow {
  startMin: number
  endMin: number
  /** 1 when the window ends on the next local day. */
  overnight: 0 | 1
}

/** Parses the windows once (throwing on a bad time) into a weekday lookup (0 = Monday). */
function weekdayWindows(p: FreeSlotPrefs & { dayStart: string; dayEnd: string }): (weekday: number) => MinutesWindow | null {
  const parse = (w: DayWindow): MinutesWindow => {
    const startMin = parseTimeOfDay(w.dayStart)
    const endMin = parseTimeOfDay(w.dayEnd)
    return { startMin, endMin, overnight: endMin <= startMin ? 1 : 0 }
  }
  if (p.days === undefined) {
    const every = parse(p)
    return () => every
  }
  if (p.days.length !== 7) throw new RangeError(`days must have 7 entries (Monday first), got ${p.days.length}`)
  const byDay = p.days.map((w) => (w ? parse(w) : null))
  return (weekday) => byDay[weekday]
}

/** 0 = Monday ... 6 = Sunday for a local calendar date (`day` may run past the month). */
function weekdayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

/**
 * The local study-day windows (`dayStart`-`dayEnd` in `timeZone`, or each
 * weekday's entry in `days`) that intersect `range`, clipped to it.
 * DST-safe: each window is computed from its own local date, so a 08:00
 * start stays 08:00 local across transitions.
 */
export function dayWindows(range: Interval, prefs: FreeSlotPrefs = {}): Interval[] {
  const p = { ...DEFAULT_FREE_SLOT_PREFS, ...prefs }
  const windowOn = weekdayWindows(p)
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    throw new RangeError('range start and end must be finite UTC ms values')
  }
  const out: Interval[] = []
  if (!(range.end > range.start)) return out
  const first = wallClock(range.start, p.timeZone)
  // Start one local day early so a window that began yesterday evening and
  // runs past midnight is included. Stop at the first local day that starts
  // at or after the range end: none of its windows (or later ones) can
  // intersect the range.
  for (let i = -1; ; i++) {
    const day = first.day + i
    if (zonedTimeToUtc(first.year, first.month, day, 0, p.timeZone) >= range.end) break
    const w = windowOn(weekdayIndex(first.year, first.month, day))
    if (!w) continue
    const start = zonedTimeToUtc(first.year, first.month, day, w.startMin, p.timeZone)
    const end = zonedTimeToUtc(first.year, first.month, day + w.overnight, w.endMin, p.timeZone)
    if (start < range.end && end > range.start) {
      out.push({ start: Math.max(start, range.start), end: Math.min(end, range.end) })
    }
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
