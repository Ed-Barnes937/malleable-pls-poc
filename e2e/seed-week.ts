import type { NewPlanItem } from '../packages/substrate/src'
import { wallClock, zonedTimeToUtc } from '../packages/scheduler/src'
import { REVIEW_SUBTYPE } from '../packages/substrate/src/workflows/review-automation'

/**
 * Priya's week: the plan items `pnpm db:reseed` restores, built relative to
 * "now" so a reseed always looks like this week (demo step 1 in
 * plans/student-planning-demo.md).
 *
 * - Fixed blocks: Biology lectures (Mon, Wed), a Chemistry lecture (Tue) and
 *   two cafe shifts (Tue and Thu evening), each a weekly series in London
 *   time that started a few weeks ago, so every week shows them.
 * - Deadlines: Biology quiz on Thursday, Chemistry lab report on Friday.
 * - Study Priya already planned: Biology reading on Saturday morning (2h)
 *   and lab prep on Sunday (1h). Two blocks from yesterday didn't happen
 *   (still open), for demo step 6's "2 blocks didn't happen. Re-fit them?".
 * - Open to-dos with estimates, not yet scheduled. They add up to 12 hours,
 *   the "Your to-dos need 12." of demo step 2. Only the lab report write-up
 *   (3h) is longer than the default 2h of study time a day, so it is
 *   Auto-fill's trim: "Shrink it to 2h?".
 *
 * Demo step 2 on a Tuesday morning (the demo day): 2h of study time left on
 * each day Tue-Fri, none on Saturday (the reading fills it) and 1h on
 * Sunday, so "About 9 hours of study time left this week. Your to-dos need
 * 12." (seed-week.test.ts pins this through the real planning code).
 *
 * The weekly blocks are anchored on the London week containing `now`. Each
 * deadline (and the to-do due with it) and each planned study block is this
 * week's, unless that has already passed (started), then next week's: so
 * they are always still ahead, whatever the day and time.
 *
 * Kept pure (no DB) so other seeds and tests can build on it; ids are fixed
 * so they can be referred to.
 */

export const SEED_TIME_ZONE = 'Europe/London'

export interface SeedPlanItem extends NewPlanItem {
  id: string
  /** When the row was made and last changed; the database's now() if unset. */
  created_at?: string
  updated_at?: string
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

/** The two study blocks seeded as yesterday's and not done (re-fit candidates). */
export const SEED_MISSED_IDS = ['seed-missed-notes', 'seed-missed-reading'] as const

export function priyaWeek(now: number = Date.now()): SeedPlanItem[] {
  const monday = weekMonday(now)
  /** ISO instant for a London wall time on `day` of the anchor week (+ `weekOffset` weeks). */
  const at = (day: Day, time: string, weekOffset = 0) => {
    const [h, m] = time.split(':').map(Number)
    const date = monday.day + DAY_NAMES.indexOf(day) + weekOffset * 7
    return new Date(zonedTimeToUtc(monday.year, monday.month, date, h * 60 + m, SEED_TIME_ZONE)).toISOString()
  }
  const weekly = { freq: 'weekly' as const, timeZone: SEED_TIME_ZONE }
  /** Yesterday (London) at `from`-`to`: a study block whose time has passed. */
  const yesterday = (id: string, title: string, course: string, from: string, to: string): SeedPlanItem => {
    const w = wallClock(now, SEED_TIME_ZONE)
    const instant = (time: string) => {
      const [h, m] = time.split(':').map(Number)
      return new Date(zonedTimeToUtc(w.year, w.month, w.day - 1, h * 60 + m, SEED_TIME_ZONE)).toISOString()
    }
    const starts_at = instant(from)
    const ends_at = instant(to)
    return { id, kind: 'task', title, course, starts_at, ends_at, duration_min: (Date.parse(ends_at) - Date.parse(starts_at)) / 60_000 }
  }
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
  /** A study block already planned: this week's, or next week's once it has started. */
  const planned = (id: string, title: string, course: string, day: Day, from: string, to: string): SeedPlanItem => {
    const weekOffset = Date.parse(at(day, from)) > now ? 0 : 1
    const starts_at = at(day, from, weekOffset)
    const ends_at = at(day, to, weekOffset)
    const duration_min = (Date.parse(ends_at) - Date.parse(starts_at)) / 60_000
    return { id, kind: 'task', title, course, starts_at, ends_at, duration_min }
  }

  return [
    series('seed-bio-lecture-mon', 'Biology lecture', 'class', 'biology', 'Mon', '10:00', '12:00'),
    series('seed-bio-lecture-wed', 'Biology lecture', 'class', 'biology', 'Wed', '10:00', '12:00'),
    series('seed-chem-lecture-tue', 'Chemistry lecture', 'class', 'chemistry', 'Tue', '14:00', '16:00'),
    series('seed-shift-tue', 'Cafe shift', 'shift', null, 'Tue', '17:00', '22:00'),
    series('seed-shift-thu', 'Cafe shift', 'shift', null, 'Thu', '17:00', '22:00'),

    { id: 'seed-bio-quiz', kind: 'deadline', title: 'Biology quiz', course: 'biology', due_at: quizDue },
    { id: 'seed-chem-lab-report', kind: 'deadline', title: 'Chemistry lab report', course: 'chemistry', due_at: labReportDue },

    // Didn't happen (still open): demo step 6's "2 blocks didn't happen.
    // Re-fit them?". Both Biology, so the Biology board asks about both.
    yesterday(SEED_MISSED_IDS[0], 'Read lecture notes: cell division', 'biology', '08:30', '09:30'),
    yesterday(SEED_MISSED_IDS[1], 'Practice questions: cell structure', 'biology', '12:30', '13:30'),

    planned('seed-study-bio-reading', 'Biology reading: chapter 4', 'biology', 'Sat', '10:00', '12:00'),
    planned('seed-study-lab-prep', 'Lab prep: read the method', 'chemistry', 'Sun', '11:00', '12:00'),

    { id: 'seed-todo-lab-write-up', kind: 'task', title: 'Lab report write-up', course: 'chemistry', duration_min: 180, due_at: labReportDue },
    { id: 'seed-todo-quiz-revision', kind: 'task', title: 'Revise for the Biology quiz', course: 'biology', duration_min: 120, due_at: quizDue },
    { id: 'seed-todo-problem-sheet', kind: 'task', title: 'Chemistry problem sheet', course: 'chemistry', duration_min: 120 },
    { id: 'seed-todo-past-paper', kind: 'task', title: 'Chemistry past paper', course: 'chemistry', duration_min: 120 },
    { id: 'seed-todo-essay-plan', kind: 'task', title: 'Plan the Biology essay', course: 'biology', duration_min: 120 },
    { id: 'seed-todo-flashcards', kind: 'task', title: 'Make flashcards: cell structure', course: 'biology', duration_min: 60 },
  ]
}

/**
 * The reviews the confusion automation made for the confusing moments
 * marked in the seeded lectures (002_seed.sql), in its shape: a 20-min
 * `review` to-do linked to the moment (recording + offset), course from the
 * lecture, placed within 3 days. Their titles are what a live model writes
 * ("Review: maternal inheritance"), so Weak topics labels the seeded moments
 * the way the live demo labels a new one. All done back in April: nothing
 * shows in this week's calendar, To-do or Help me plan.
 */
export function seededReviews(): SeedPlanItem[] {
  const review = (id: string, topic: string, course: string, recordingId: string, offsetMs: number, startsAt: string, dueAt: string): SeedPlanItem => ({
    id, kind: 'task', title: `Review: ${topic}`, course, subtype: REVIEW_SUBTYPE, status: 'done', duration_min: 20,
    starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 20 * 60_000).toISOString(), due_at: dueAt,
    source_type: 'recording', source_id: recordingId, source_offset_ms: offsetMs,
    // Made when the moment was marked, ticked off after the block, not today.
    created_at: new Date(Date.parse(startsAt) - 3 * 24 * 60 * 60_000).toISOString(),
    updated_at: new Date(Date.parse(startsAt) + 20 * 60_000).toISOString(),
  })
  // Marked on Thu 16 Apr (rec-bio-4) and Thu 9 Apr (rec-chem-1); due 23:59 London three days later.
  return [
    review('seed-review-maternal', 'maternal inheritance', 'biology', 'rec-bio-4', 540000, '2026-04-19T18:00:00.000Z', '2026-04-19T22:59:00.000Z'),
    review('seed-review-disease', 'mitochondrial disease', 'biology', 'rec-bio-4', 1260000, '2026-04-19T18:30:00.000Z', '2026-04-19T22:59:00.000Z'),
    review('seed-review-paternal', 'paternal inheritance', 'biology', 'rec-bio-4', 1620000, '2026-04-19T19:00:00.000Z', '2026-04-19T22:59:00.000Z'),
    review('seed-review-sn1', 'SN1 mechanism', 'chemistry', 'rec-chem-1', 540000, '2026-04-12T18:00:00.000Z', '2026-04-12T22:59:00.000Z'),
  ]
}
