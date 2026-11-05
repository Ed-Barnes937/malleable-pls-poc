import {
  ASSUMED_ESTIMATE_MIN,
  bookedMinutes,
  isSession,
  localDayRange,
  todosToPlan,
  type PlanItem,
  type UserPreferences,
} from '@pls/substrate'
import { COURSES } from '@pls/shared-ui'

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

type Row = Pick<
  PlanItem,
  'id' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'due_at' | 'subtype' | 'title' | 'course' | 'duration_min' | 'source_type' | 'source_id'
> & { occurrence_key?: string }

/** How many items the popover lists. */
export const UP_NEXT_COUNT = 5

/** A calendar item still to come (or going on now): a class, a shift or a study block. */
export interface UpNextItem {
  key: string
  /** "Chemistry" for a class (the course, as the Calendar names it), else the item's title. */
  name: string
  type: 'class' | 'shift' | 'study'
  /** The course tag, for its colour. */
  course: string | null
  startMs: number
  endMs: number
  /** "17:00" in the student's zone. */
  time: string
  /** "17:00-22:00". */
  span: string
  /** Going on now. */
  live: boolean
}

export interface UpNextDay {
  /** "Today", "Tomorrow", "Thursday", or "Mon 9 Nov" beyond a week. */
  label: string
  items: UpNextItem[]
}

export interface DueItem {
  key: string
  title: string
  type: 'deadline' | 'todo'
  dueMs: number
  /** "Thu 17:00". */
  when: string
}

export interface UpNextSummary {
  /** The next item, for the top bar's button; null when nothing is booked ahead. */
  next: UpNextItem | null
  /** The next few items, grouped by day. */
  days: UpNextDay[]
  /** Deadlines and dated to-dos due before the week ends. */
  due: DueItem[]
  /** Study booked from now to the end of the week, in minutes. */
  studyBookedMin: number
  /** To-dos with time still to book (all of them, not only this week's). */
  unbooked: { count: number; minutes: number }
}

/** The zone the student's times are read in: theirs if set, else the browser's; null while preferences load. */
export function upNextZone(prefs: UserPreferences | undefined, failed: boolean, browserZone: string): string | null {
  if (!prefs && !failed) return null
  return prefs?.time_zone ?? browserZone
}

/** The span plan items are fetched for: today's start to the start of the week after this one. */
export function upNextRange(now: number, timeZone: string): { from: string; to: string } {
  const today = localDayRange(now, timeZone)
  return { from: new Date(today.start).toISOString(), to: new Date(weekEnd(now, timeZone) + 7 * DAY_MS).toISOString() }
}

/** The start (UTC ms) of the coming Monday in `timeZone`: the end of this Monday-to-Sunday week. */
export function weekEnd(now: number, timeZone: string): number {
  const today = localDayRange(now, timeZone)
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone }).format(new Date(now))
  const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday)
  // Noon of a day lands inside it whatever the clocks did overnight.
  return localDayRange(today.start + (7 - sinceMonday) * DAY_MS + 12 * 60 * MINUTE_MS, timeZone).start
}

function clockIn(timeZone: string): (ms: number) => string {
  const format = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return (ms) => format.format(new Date(ms))
}

function itemName(row: Row): string {
  const course = row.kind === 'commitment' && row.subtype === 'class' && row.course
    ? COURSES.find((c) => c.value === row.course)?.label
    : undefined
  return course ?? row.title
}

function itemType(row: Row): UpNextItem['type'] {
  if (row.kind !== 'commitment') return 'study'
  return row.subtype === 'shift' ? 'shift' : 'class'
}

/**
 * What the top bar's Up next button and its popover show, from the plan items
 * in `upNextRange` (recurring classes expanded) and every task (to tell what
 * is booked). Everything is read in the student's `timeZone`, as the Calendar
 * does, and the week is Monday to Sunday, as the Calendar's is.
 */
export function upNextSummary(
  rows: ReadonlyArray<Row>,
  tasks: ReadonlyArray<Row>,
  opts: { now: number; timeZone: string },
): UpNextSummary {
  const { now, timeZone } = opts
  const clock = clockIn(timeZone)
  const end = weekEnd(now, timeZone)
  const today = localDayRange(now, timeZone).start

  const dayLabel = (ms: number): string => {
    const start = localDayRange(ms, timeZone).start
    const diff = Math.round((start - today) / DAY_MS)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff < 7) return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(new Date(ms))
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(new Date(ms))
  }

  const blocks: UpNextItem[] = rows
    .filter((r) => r.status === 'open' && r.starts_at && r.ends_at && (r.kind === 'commitment' || r.kind === 'task'))
    .map((r) => {
      const startMs = Date.parse(r.starts_at!)
      const endMs = Date.parse(r.ends_at!)
      return {
        key: r.occurrence_key ?? r.id,
        name: itemName(r),
        type: itemType(r),
        course: r.course,
        startMs,
        endMs,
        time: clock(startMs),
        span: `${clock(startMs)}-${clock(endMs)}`,
        live: startMs <= now && now < endMs,
      }
    })
    .filter((b) => b.endMs > now)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

  const shown = blocks.slice(0, UP_NEXT_COUNT)
  const days: UpNextDay[] = []
  for (const item of shown) {
    const label = dayLabel(item.startMs)
    const last = days[days.length - 1]
    if (last?.label === label) last.items.push(item)
    else days.push({ label, items: [item] })
  }

  const dueWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone })
  const due: DueItem[] = rows
    .filter((r) => r.status === 'open' && r.due_at && !r.starts_at && (r.kind === 'deadline' || r.kind === 'task'))
    .map((r) => ({ r, dueMs: Date.parse(r.due_at!) }))
    .filter(({ dueMs }) => dueMs >= now && dueMs < end)
    .sort((a, b) => a.dueMs - b.dueMs)
    .map(({ r, dueMs }) => ({
      key: r.occurrence_key ?? r.id,
      title: r.title,
      type: r.kind === 'deadline' ? 'deadline' : 'todo',
      dueMs,
      when: `${dueWeekday.format(new Date(dueMs))} ${clock(dueMs)}`,
    }))

  // Study left to do before the week ends: a block under way counts from now.
  const studyBookedMin = Math.round(
    blocks
      .filter((b) => b.type === 'study' && b.startMs < end)
      .reduce((sum, b) => sum + (Math.min(b.endMs, end) - Math.max(b.startMs, now)) / MINUTE_MS, 0),
  )

  // The same to-dos Help me plan offers: open, not a session, with time not booked yet.
  const open = tasks.filter((t) => t.status === 'open' && !isSession(t))
  const waiting = todosToPlan(open, bookedMinutes(tasks))
  const minutes = waiting.reduce((sum, t) => sum + (t.duration_min ?? ASSUMED_ESTIMATE_MIN), 0)

  return { next: shown[0] ?? null, days, due, studyBookedMin, unbooked: { count: waiting.length, minutes } }
}

/** What the top bar button says: "Chemistry 14:00", "Chemistry now", "Chemistry Wed 14:00"; the label is the whole text. */
export function upNextLabel(item: UpNextItem, now: number, timeZone: string): string {
  if (item.live) return `${item.name} now`
  const today = localDayRange(now, timeZone).start
  const start = localDayRange(item.startMs, timeZone).start
  if (start === today) return `${item.name} ${item.time}`
  const day = Math.round((start - today) / DAY_MS) === 1
    ? 'tomorrow'
    : new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone }).format(new Date(item.startMs))
  return `${item.name} ${day} ${item.time}`
}
