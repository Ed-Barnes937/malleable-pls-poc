import type { NewPlanItem } from '../packages/substrate/src'
import { wallClock, zonedTimeToUtc } from '../packages/scheduler/src'

/**
 * Priya's week: the plan items `pnpm db:reseed` restores, built relative to
 * "now" so a reseed always looks like this week (demo step 1 in
 * plans/student-planning-demo.md).
 *
 * - Fixed blocks: Biology lectures (Mon, Wed), a Chemistry lecture (Tue) and
 *   two cafe shifts (Tue and Thu evening), each a weekly series in London
 *   time that started a few weeks ago, so every week shows them.
 * - Deadlines: Biology quiz on Thursday, Chemistry lab report on Friday.
 * - Open to-dos with estimates, not yet scheduled. They add up to 12 hours,
 *   the "This needs 12." of demo step 2.
 *
 * The weekly blocks are anchored on the London week containing `now`. Each
 * deadline (and the to-do due with it) is this week's, unless that has
 * already passed, then next week's: so the quiz and lab report are always
 * still ahead, whatever the day and time.
 *
 * Kept pure (no DB) so other seeds and tests can build on it; ids are fixed
 * so they can be referred to.
 */

export const SEED_TIME_ZONE = 'Europe/London'

export interface SeedPlanItem extends NewPlanItem {
  id: string
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
type Day = (typeof DAY_NAMES)[number]

/** Weeks of the series before the anchor week: the term is under way. */
const SERIES_STARTED_WEEKS_AGO = 4

/** Monday of the London week containing `now`, as a calendar date (day may overflow; zonedTimeToUtc normalises). */
export function weekMonday(now: number): { year: number; month: number; day: number } {
  const w = wallClock(now, SEED_TIME_ZONE)
  // 0 = Monday ... 6 = Sunday
  const weekday = (new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7
  return { year: w.year, month: w.month, day: w.day - weekday }
}

export function priyaWeek(now: number = Date.now()): SeedPlanItem[] {
  const monday = weekMonday(now)
  /** ISO instant for a London wall time on `day` of the anchor week (+ `weekOffset` weeks). */
  const at = (day: Day, time: string, weekOffset = 0) => {
    const [h, m] = time.split(':').map(Number)
    const date = monday.day + DAY_NAMES.indexOf(day) + weekOffset * 7
    return new Date(zonedTimeToUtc(monday.year, monday.month, date, h * 60 + m, SEED_TIME_ZONE)).toISOString()
  }
  const weekly = { freq: 'weekly' as const, timeZone: SEED_TIME_ZONE }
  const series = (id: string, title: string, subtype: string, course: string | null, day: Day, from: string, to: string): SeedPlanItem => ({
    id, kind: 'commitment', title, subtype, course,
    starts_at: at(day, from, -SERIES_STARTED_WEEKS_AGO),
    ends_at: at(day, to, -SERIES_STARTED_WEEKS_AGO),
    recurrence: weekly,
  })

  /** This week's `day` at `time`, or next week's once that has passed. */
  const nextDue = (day: Day, time: string) => {
    const thisWeek = at(day, time)
    return Date.parse(thisWeek) > now ? thisWeek : at(day, time, 1)
  }
  const quizDue = nextDue('Thu', '10:00')
  const labReportDue = nextDue('Fri', '17:00')

  return [
    series('seed-bio-lecture-mon', 'Biology lecture', 'class', 'biology', 'Mon', '10:00', '12:00'),
    series('seed-bio-lecture-wed', 'Biology lecture', 'class', 'biology', 'Wed', '10:00', '12:00'),
    series('seed-chem-lecture-tue', 'Chemistry lecture', 'class', 'chemistry', 'Tue', '14:00', '16:00'),
    series('seed-shift-tue', 'Cafe shift', 'shift', null, 'Tue', '17:00', '22:00'),
    series('seed-shift-thu', 'Cafe shift', 'shift', null, 'Thu', '17:00', '22:00'),

    { id: 'seed-bio-quiz', kind: 'deadline', title: 'Biology quiz', course: 'biology', due_at: quizDue },
    { id: 'seed-chem-lab-report', kind: 'deadline', title: 'Chemistry lab report', course: 'chemistry', due_at: labReportDue },

    { id: 'seed-todo-lab-write-up', kind: 'task', title: 'Lab report write-up', course: 'chemistry', duration_min: 450, due_at: labReportDue },
    { id: 'seed-todo-quiz-revision', kind: 'task', title: 'Revise for the Biology quiz', course: 'biology', duration_min: 120, due_at: quizDue },
    { id: 'seed-todo-problem-sheet', kind: 'task', title: 'Chemistry problem sheet', course: 'chemistry', duration_min: 90 },
    { id: 'seed-todo-flashcards', kind: 'task', title: 'Make flashcards: cell structure', course: 'biology', duration_min: 60 },
  ]
}
