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
}

const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })

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
  }
}
