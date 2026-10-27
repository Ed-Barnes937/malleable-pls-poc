/**
 * Local-time calendar arithmetic. Everything works on the browser's wall
 * clock: day boundaries come from `new Date(y, m, d)` (never `+ 24h`), so
 * days stay aligned across DST changes.
 */

export const MINUTES_PER_DAY = 24 * 60
/** Grid snap for creating, moving and resizing blocks. */
export const SNAP_MIN = 15
/** The part of the day the grid is sized to fit (the rest scrolls). */
export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 22

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** Monday 00:00 (local) of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  return addDays(day, -((day.getDay() + 6) % 7))
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Wall-clock minutes since midnight, e.g. 09:30 is 570. */
export function wallMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** The instant `minutes` after local midnight of `day` (wall clock, DST-safe). */
export function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes)
}

export function snap(minutes: number, step = SNAP_MIN): number {
  return Math.round(minutes / step) * step
}

export function snapDown(minutes: number, step = SNAP_MIN): number {
  return Math.floor(minutes / step) * step
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 24-hour "09:30". */
export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "09:30 - 10:45". */
export function formatSpan(start: Date, end: Date): string {
  return `${formatClock(start)} - ${formatClock(end)}`
}

/** Grid hour label, "08:00". */
export function formatHour(hour: number): string {
  return `${pad(hour)}:00`
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const longDayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short' })

/** "Mon". */
export function formatWeekday(d: Date): string {
  return dayFormat.format(d)
}

/** "Tue 27 Oct". */
export function formatLongDay(d: Date): string {
  return longDayFormat.format(d).replace(',', '')
}

/**
 * Header title for the days shown: "26 Oct - 1 Nov 2026", "2 - 8 Nov 2026",
 * or a single day "Tue 27 Oct 2026".
 */
export function formatRangeTitle(first: Date, last: Date): string {
  const year = last.getFullYear()
  if (sameDay(first, last)) return `${formatLongDay(first)} ${year}`
  const firstMonth = monthFormat.format(first)
  const lastMonth = monthFormat.format(last)
  const left = firstMonth === lastMonth ? `${first.getDate()}` : `${first.getDate()} ${firstMonth}`
  const leftYear = first.getFullYear() !== year ? ` ${first.getFullYear()}` : ''
  return `${left}${leftYear} - ${last.getDate()} ${lastMonth} ${year}`
}

/** "45 min", "1 h", "1 h 30". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${pad(m)}`
}

/** "yyyy-mm-dd" for `<input type="date">` (local). */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "hh:mm" for `<input type="time">` (local). */
export function toTimeInput(d: Date): string {
  return formatClock(d)
}

/** Combines `<input type="date">` and `<input type="time">` values into a local instant. */
export function fromInputs(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]))
}

/** The browser's IANA zone, so a weekly class keeps its wall-clock time across DST. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Where "Pick a time" starts for a to-do of `durationMin`: the first free
 * gap (UTC ms intervals, in order) long enough for it, at a 15-minute
 * boundary; else the first free moment of at least 15 minutes; else null.
 */
export function firstFreeStart(free: ReadonlyArray<{ start: number; end: number }>, durationMin: number): number | null {
  const step = SNAP_MIN * 60_000
  const aligned = (f: { start: number }) => Math.ceil(f.start / step) * step
  const fits = (f: { start: number; end: number }, min: number) => f.end - aligned(f) >= min * 60_000
  const gap = free.find((f) => fits(f, durationMin)) ?? free.find((f) => fits(f, SNAP_MIN))
  return gap ? aligned(gap) : null
}
