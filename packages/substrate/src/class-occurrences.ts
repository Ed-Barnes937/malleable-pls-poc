/**
 * Class occurrences and the lectures that hang off them, shared by the
 * server, the CT backend simulator and the widgets, so all three agree on
 * what "Tuesday's Biology class" is. Pure: no DB, no clock.
 *
 * A lecture links to an occurrence by `(class_item_id, class_date)`: the
 * plan item and the occurrence's local date (YYYY-MM-DD). The date is read
 * in the series' time zone, else in the student's (their preference, else
 * the browser's; the caller passes it as `timeZone`), never UTC.
 */
import { expandPlanItems } from './plan-items'
import type { PlanItem, PlanItemOccurrence } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/** How long before a class starts a capture already counts as being in it. */
export const CLASS_CAPTURE_LEAD_MIN = 15

/** The local date (YYYY-MM-DD) of `instant` in `timeZone`. */
export function localDate(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))
}

/**
 * The date an occurrence row is on: its start's local date in the series'
 * zone, else in `timeZone` (the student's). This is a lecture's `class_date`.
 */
export function occurrenceDate(
  row: Pick<PlanItem, 'starts_at' | 'recurrence'>,
  timeZone: string,
): string | null {
  if (!row.starts_at) return null
  return localDate(row.starts_at, row.recurrence?.timeZone ?? timeZone)
}

/**
 * A class block: a commitment that is a class (`subtype = 'class'`) or has
 * a course (a seminar, a lab). A shift or other course-less commitment is
 * not, nor are tasks and deadlines.
 */
export function isClassBlock(item: Pick<PlanItem, 'kind' | 'subtype' | 'course'>): boolean {
  return item.kind === 'commitment' && (item.subtype === 'class' || item.course != null)
}

/** The occurrence of `item` on local `date` (YYYY-MM-DD), or null when it has none that day. */
export function occurrenceOn(item: PlanItem, date: string, timeZone: string): PlanItemOccurrence | null {
  const midnight = Date.parse(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(midnight)) return null
  // Wide enough for every zone's local day (UTC-12 .. UTC+14), then narrowed
  // by the date the occurrence is on.
  const rows = expandPlanItems([item], {
    from: new Date(midnight - 2 * DAY_MS).toISOString(),
    to: new Date(midnight + 3 * DAY_MS).toISOString(),
  })
  return rows.find((row) => occurrenceDate(row, timeZone) === date) ?? null
}

/**
 * Which class a capture started at `at` joins, silently: an open class block
 * of the capture's course (none: a class with no course) that is on at `at`,
 * counting from `CLASS_CAPTURE_LEAD_MIN` before its start up to its end.
 * When several are, the one that started last (then by occurrence key).
 *
 * `rows` are plan item list rows already expanded over a range around `at`.
 *
 * This is the one place that decides class matching on Record, so the
 * still-open product question (decision Q8: match silently, or ask "Is this
 * Tuesday's Biology lecture?" the first time) changes here only. Today it
 * matches silently.
 */
export function classForCapture(
  rows: PlanItemOccurrence[],
  capture: { course: string | null; at: number },
): PlanItemOccurrence | null {
  const lead = CLASS_CAPTURE_LEAD_MIN * 60_000
  const on = rows.filter((row) =>
    isClassBlock(row)
    && row.status === 'open'
    && (row.course ?? null) === capture.course
    && row.starts_at != null && row.ends_at != null
    && Date.parse(row.starts_at) - lead <= capture.at
    && capture.at <= Date.parse(row.ends_at))
  on.sort((a, b) => Date.parse(b.starts_at!) - Date.parse(a.starts_at!) || a.occurrence_key.localeCompare(b.occurrence_key))
  return on[0] ?? null
}

/** The range of plan item rows `classForCapture` needs for a capture at `at`. */
export function captureClassRange(at: number): { from: string; to: string } {
  return { from: new Date(at - DAY_MS).toISOString(), to: new Date(at + DAY_MS).toISOString() }
}

/**
 * A class occurrence's lecture title: the class's name and the day, e.g.
 * "Biology lecture · Tue 28 Oct". `date` is the occurrence's `class_date`.
 */
export function classLectureTitle(classTitle: string, date: string): string {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
  const part = (type: Intl.DateTimeFormatPartTypes) => day.find((p) => p.type === type)?.value ?? ''
  return `${classTitle} · ${part('weekday')} ${part('day')} ${part('month')}`
}
