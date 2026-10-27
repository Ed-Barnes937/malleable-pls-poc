/**
 * Calm, student-facing date labels for plan items (to-dos, deadlines,
 * study blocks). Times use the viewer's local zone; `now` is a parameter so
 * the wording is testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const LOCALE = 'en-GB'

const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const shortDate = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const clock = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Local midnight at the start of the day containing `t`. */
export function startOfLocalDay(t: number | Date): Date {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole local days from today to the day of `t` (negative in the past). */
export function daysFromToday(t: number | string | Date, now: number | Date = Date.now()): number {
  const day = startOfLocalDay(typeof t === 'string' ? Date.parse(t) : t)
  const today = startOfLocalDay(now)
  // Round: a DST day is 23 or 25 hours long.
  return Math.round((day.getTime() - today.getTime()) / DAY_MS)
}

/** Local day key ("2026-10-29") for grouping items by day. */
export function localDayKey(t: number | string | Date): string {
  const d = new Date(typeof t === 'string' ? Date.parse(t) : t)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "Today", "Tomorrow", "Thu 29 Oct". For a day heading or a due label. */
export function dayLabel(t: number | string | Date, now: number | Date = Date.now()): string {
  const days = daysFromToday(t, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return shortDate.format(new Date(typeof t === 'string' ? Date.parse(t) : t))
}

/** "14:00". */
export function clockTime(t: number | string | Date): string {
  return clock.format(new Date(typeof t === 'string' ? Date.parse(t) : t))
}

/** "Today 14:00", "Tomorrow 09:30", "Thu 29 Oct 16:00". */
export function dayAndTime(t: number | string | Date, now: number | Date = Date.now()): string {
  return `${dayLabel(t, now)} ${clockTime(t)}`
}

/**
 * Gentle wording for something still open from the past: "Still to do from
 * yesterday", "Still to do from Monday" (within the last week), "Still to do
 * from 12 Oct". Never "overdue".
 */
export function stillToDoLabel(t: number | string | Date, now: number | Date = Date.now()): string {
  const days = daysFromToday(t, now)
  const date = new Date(typeof t === 'string' ? Date.parse(t) : t)
  if (days >= 0) return 'Still to do from earlier today'
  if (days === -1) return 'Still to do from yesterday'
  if (days > -7) return `Still to do from ${weekday.format(date)}`
  return `Still to do from ${dayMonth.format(date)}`
}

/**
 * All-day convention for due dates, shared by every planning widget
 * (To-do, Coming up, Calendar): a `due_at` at exactly local 00:00:00.000
 * means "due on that date, all day", not "due at midnight". Show it with no
 * time, on that date (never the evening before), and treat it as still to
 * come until that day ends. Any other time is a real due time.
 */
export function isAllDay(dueAt: number | string | Date): boolean {
  const d = new Date(typeof dueAt === 'string' ? Date.parse(dueAt) : dueAt)
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
}

/**
 * The instant a due date has passed: the due time itself, or for an all-day
 * due date (see `isAllDay`) the local midnight that ends that day.
 */
export function dueEnd(dueAt: number | string | Date): number {
  const t = typeof dueAt === 'string' ? Date.parse(dueAt) : new Date(dueAt).getTime()
  if (!isAllDay(t)) return t
  const end = new Date(t)
  end.setDate(end.getDate() + 1)
  return end.getTime()
}

/** "20m", "1h", "1h 30m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
