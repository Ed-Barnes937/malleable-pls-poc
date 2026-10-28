import { studyDays, weekLayout, type PlanItem } from '@pls/substrate'
import { COURSES, clockTime, startOfLocalDay } from '@pls/shared-ui'

type Row = Pick<PlanItem, 'id' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'subtype' | 'title' | 'course'>

export interface TodayLine {
  /** "Tuesday" */
  weekday: string
  /** Today's fixed blocks, in time order: "Chemistry 14:00", "shift 17:00-22:00". */
  events: string[]
  /** Study time left today, as Help me plan counts it (free time capped by the day's budget). */
  studyLeftMin: number
  /** The phone's shorter form: "Tue" and the blocks not over yet, by start time ("shift 17:00"). */
  short: { weekday: string; upcoming: string[] }
}

const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const shortWeekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })

/** Today's local day as [start, end), DST-safe. */
export function todayRange(now: number): { start: number; end: number } {
  const start = startOfLocalDay(now)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.getTime(), end: end.getTime() }
}

function eventLabel(row: Row): string {
  const start = clockTime(row.starts_at!)
  if (row.subtype === 'shift') return `shift ${start}-${clockTime(row.ends_at!)}`
  const course = row.subtype === 'class' && row.course
    ? COURSES.find((c) => c.value === row.course)?.label
    : undefined
  return `${course ?? row.title} ${start}`
}

function shortEventLabel(row: Row): string {
  return row.subtype === 'shift' ? `shift ${clockTime(row.starts_at!)}` : eventLabel(row)
}

/**
 * The top bar's quiet summary of today, from today's plan item rows
 * (`listPlanItems` with today's `from`/`to`, so weekly classes are expanded):
 * the weekday, each class and shift, and the study time left. Study time
 * comes from the same `weekLayout` / `studyDays` Help me plan uses, so the
 * two never disagree. Null when today has no class or shift: an empty day
 * has nothing worth a line.
 */
export function todayLine(
  rows: ReadonlyArray<Row>,
  opts: { now: number; timeZone: string; studyMinPerDay?: number },
): TodayLine | null {
  const day = todayRange(opts.now)
  const commitments = rows
    .filter((r) => r.kind === 'commitment' && r.status !== 'dismissed' && r.starts_at && r.ends_at)
    .filter((r) => {
      const start = Date.parse(r.starts_at!)
      return start >= day.start && start < day.end
    })
    .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!))
  if (commitments.length === 0) return null

  const layout = weekLayout(rows, day, { timeZone: opts.timeZone, studyMinPerDay: opts.studyMinPerDay })
  const today = studyDays(layout, opts.now).find((d) => d.day === day.start)
  return {
    weekday: weekdayFormat.format(new Date(opts.now)),
    events: commitments.map(eventLabel),
    studyLeftMin: today?.leftMin ?? 0,
    short: {
      weekday: shortWeekdayFormat.format(new Date(opts.now)),
      upcoming: commitments.filter((r) => Date.parse(r.ends_at!) > opts.now).map(shortEventLabel),
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
