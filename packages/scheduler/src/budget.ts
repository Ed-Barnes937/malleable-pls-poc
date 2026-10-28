import { MINUTE_MS, normalize, type Interval } from './intervals'
import { startOfLocalDay } from './time'

/**
 * A cap on study time per local day ("2 hours a day"), so a plan is one a
 * student would actually follow rather than every free minute of the study
 * day. Blocks already on the calendar that day (accepted study time) count
 * against it.
 */
export interface DailyBudget {
  /** Study minutes allowed per local day; a finite number > 0. */
  minutesPerDay: number
  /** IANA zone the day boundaries are read in. */
  timeZone: string
}

export function checkBudget(budget: DailyBudget | undefined): void {
  if (!budget) return
  if (!(budget.minutesPerDay > 0) || !Number.isFinite(budget.minutesPerDay)) {
    throw new RangeError(`dailyBudget.minutesPerDay must be a finite number > 0, got ${budget.minutesPerDay}`)
  }
  // Throws a RangeError for an unknown zone.
  new Intl.DateTimeFormat('en-US', { timeZone: budget.timeZone })
}

/** An interval piece inside one local day, keyed by that day's local midnight (UTC ms). */
export interface DayPiece extends Interval {
  day: number
}

/**
 * Cuts intervals at local midnights in `timeZone`, so each piece lies in one
 * local day (DST-safe: days are 23 or 25 hours long when the clocks change).
 * Pieces are sorted and disjoint.
 */
export function splitByLocalDay(intervals: ReadonlyArray<Interval>, timeZone: string): DayPiece[] {
  const out: DayPiece[] = []
  for (const iv of normalize(intervals)) {
    if (!Number.isFinite(iv.start) || !Number.isFinite(iv.end)) {
      throw new RangeError('a daily budget needs bounded intervals (finite start and end)')
    }
    let cur = iv.start
    while (cur < iv.end) {
      const day = startOfLocalDay(cur, timeZone)
      const next = startOfLocalDay(cur, timeZone, 1)
      const end = Math.min(iv.end, next)
      out.push({ day, start: cur, end })
      cur = end
    }
  }
  return out
}

/** Minutes per local day (keyed by local midnight), overlapping intervals counted once. */
export function minutesByDay(intervals: ReadonlyArray<Interval>, timeZone: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const p of splitByLocalDay(intervals, timeZone)) {
    out.set(p.day, (out.get(p.day) ?? 0) + (p.end - p.start) / MINUTE_MS)
  }
  return out
}
