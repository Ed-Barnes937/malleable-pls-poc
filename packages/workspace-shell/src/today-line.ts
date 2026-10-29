import { DEFAULT_PREFERENCES, localDayRange, studyDays, weekLayout, type PlanItem, type StudyHours, type UserPreferences } from '@pls/substrate'
import { COURSES } from '@pls/shared-ui'

type Row = Pick<PlanItem, 'id' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'subtype' | 'title' | 'course'>

export interface TodayLine {
  /** "Tuesday" */
  weekday: string
  /** Today's fixed blocks not over yet, in time order: "Chemistry 14:00", "shift 17:00-22:00". */
  events: string[]
  /** Study time left today, as Help me plan counts it (free time capped by the day's budget). */
  studyLeftMin: number
  /** The phone's shorter form: "Tue" and the blocks not over yet, by start time ("shift 17:00"). */
  short: { weekday: string; upcoming: string[] }
}

export interface TodayStudyOptions {
  /** The zone study time is counted in: the student's, else the browser's. */
  timeZone: string
  studyHours: StudyHours
  studyMinPerDay: number
}

/**
 * How the line counts study time, from the student's preference (as Help me
 * plan does): their zone if set, else the browser's; the defaults if the
 * preference can't be loaded; null while it is still loading.
 */
export function todayStudyOptions(
  prefs: UserPreferences | undefined,
  failed: boolean,
  browserZone: string,
): TodayStudyOptions | null {
  const p = prefs ?? (failed ? DEFAULT_PREFERENCES : undefined)
  if (!p) return null
  return { timeZone: p.time_zone ?? browserZone, studyHours: p.study_hours, studyMinPerDay: p.study_min_per_day }
}

/** "14:00" in `timeZone`. */
function clockIn(timeZone: string): (iso: string) => string {
  const format = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return (iso) => format.format(new Date(Date.parse(iso)))
}

function eventLabel(row: Row, clock: (iso: string) => string): string {
  const start = clock(row.starts_at!)
  if (row.subtype === 'shift') return `shift ${start}-${clock(row.ends_at!)}`
  const course = row.subtype === 'class' && row.course
    ? COURSES.find((c) => c.value === row.course)?.label
    : undefined
  return `${course ?? row.title} ${start}`
}

function shortEventLabel(row: Row, clock: (iso: string) => string): string {
  return row.subtype === 'shift' ? `shift ${clock(row.starts_at!)}` : eventLabel(row, clock)
}

/**
 * The top bar's quiet summary of today, from today's plan item rows
 * (`listPlanItems` with today's `from`/`to`, so weekly classes are expanded):
 * the weekday, each class and shift not over yet, and the study time left
 * (a lecture that ended at 12:00 is no longer news at noon). Study time
 * comes from the same `weekLayout` / `studyDays` Help me plan uses, so the
 * two never disagree: inside `studyHours`. The whole line is today in
 * `timeZone` (the student's), weekday, times and study time alike, so it
 * never mixes two days when the browser is somewhere else. Null when today
 * has no class or shift: an empty day has nothing worth a line.
 */
export function todayLine(
  rows: ReadonlyArray<Row>,
  opts: { now: number; timeZone: string; studyHours?: StudyHours; studyMinPerDay?: number },
): TodayLine | null {
  const day = localDayRange(opts.now, opts.timeZone)
  const clock = clockIn(opts.timeZone)
  const commitments = rows
    .filter((r) => r.kind === 'commitment' && r.status !== 'dismissed' && r.starts_at && r.ends_at)
    .filter((r) => {
      const start = Date.parse(r.starts_at!)
      return start >= day.start && start < day.end
    })
    .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!))
  if (commitments.length === 0) return null

  const layout = weekLayout(rows, day, { timeZone: opts.timeZone, studyHours: opts.studyHours, studyMinPerDay: opts.studyMinPerDay })
  const today = studyDays(layout, opts.now).find((d) => d.day === day.start)
  const upcoming = commitments.filter((r) => Date.parse(r.ends_at!) > opts.now)
  const weekday = (style: 'long' | 'short') =>
    new Intl.DateTimeFormat('en-GB', { weekday: style, timeZone: opts.timeZone }).format(new Date(opts.now))
  return {
    weekday: weekday('long'),
    events: upcoming.map((r) => eventLabel(r, clock)),
    studyLeftMin: today?.leftMin ?? 0,
    short: {
      weekday: weekday('short'),
      upcoming: upcoming.map((r) => shortEventLabel(r, clock)),
    },
  }
}

/**
 * What the phone's today line can say, longest first; it shows the first
 * that fits. Drops the weekday, then the later blocks (the next one matters
 * most), and keeps the study time to the end. Empty when nothing is left of
 * the day to mention.
 */
export function shortLineOptions(short: TodayLine['short'], study: string | null): string[][] {
  const tail = study ? [study] : []
  const { weekday, upcoming } = short
  if (upcoming.length === 0 && !study) return []
  const options = [[weekday, ...upcoming, ...tail]]
  for (let n = upcoming.length; n >= 1; n--) options.push([...upcoming.slice(0, n), ...tail])
  if (study) options.push(tail)
  return options
}
