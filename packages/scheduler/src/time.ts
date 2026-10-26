/**
 * Wall-clock helpers over IANA time zones, built on `Intl.DateTimeFormat` so
 * the package has no dependencies. All instants are UTC epoch milliseconds.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    // Throws RangeError for an unknown time zone, which is what we want.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export interface WallClock {
  year: number
  /** 1-12 */
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** The wall-clock reading of `instant` in `timeZone`. */
export function wallClock(instant: number, timeZone: string): WallClock {
  const v: Record<string, number> = {}
  for (const part of formatter(timeZone).formatToParts(new Date(instant))) {
    v[part.type] = Number(part.value)
  }
  return {
    year: v.year,
    month: v.month,
    day: v.day,
    hour: v.hour,
    minute: v.minute,
    second: v.second,
  }
}

/** UTC offset of `timeZone` at `instant`, in ms (positive east of UTC). */
export function offsetMs(instant: number, timeZone: string): number {
  const w = wallClock(instant, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

const DAY_MS = 24 * 60 * 60_000

/**
 * The instant at which the wall clock in `timeZone` reads `minutesOfDay`
 * minutes past midnight on the given local date. `day` and `minutesOfDay` may
 * overflow (e.g. day 32, or 1440 minutes) and roll over like `Date.UTC`.
 *
 * DST, in every zone (the same rule as JS `Date` and Temporal's
 * `'compatible'`): a wall time that does not exist (inside a spring-forward
 * gap) moves later by the length of the gap, e.g. 02:30 becomes 03:30; an
 * ambiguous one (a fall-back hour that happens twice) resolves to the
 * earlier of the two instants. Assumes a zone changes offset at most once
 * within a day either side, which holds for all real zones.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  minutesOfDay: number,
  timeZone: string,
): number {
  const naive = Date.UTC(year, month - 1, day, 0, minutesOfDay)
  // Candidates using the offset in force a day before and a day after. In a
  // fall-back overlap both are valid and `before` is the earlier instant; in
  // a spring-forward gap neither is, and `before` lands after the gap.
  const before = naive - offsetMs(naive - DAY_MS, timeZone)
  const after = naive - offsetMs(naive + DAY_MS, timeZone)
  const reads = (t: number) => t + offsetMs(t, timeZone) === naive
  if (reads(before)) return before
  if (reads(after)) return after
  return before
}

/**
 * Local midnight in `timeZone` of the day containing `instant`, shifted by
 * `addDays` local calendar days. Handy for windows like "by end of tomorrow":
 * `startOfLocalDay(now, tz, 2)`.
 */
export function startOfLocalDay(instant: number, timeZone: string, addDays = 0): number {
  const w = wallClock(instant, timeZone)
  return zonedTimeToUtc(w.year, w.month, w.day + addDays, 0, timeZone)
}

/** Parse `"HH:MM"` (00:00-24:00) into minutes past midnight. */
export function parseTimeOfDay(value: string): number {
  const m = /^(\d{2}):([0-5]\d)$/.exec(value)
  const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : NaN
  if (!(minutes <= 1440)) {
    throw new RangeError(`Invalid time of day "${value}", expected HH:MM between 00:00 and 24:00`)
  }
  return minutes
}
