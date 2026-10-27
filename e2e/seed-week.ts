import type { NewPlanItem, PlanItem } from '../packages/substrate/src'
import { startOfLocalDay, wallClock, zonedTimeToUtc } from '../packages/scheduler/src'
import { expandPlanItems } from '../packages/substrate/src/plan-items'
import { studyDays, weekLayout } from '../packages/substrate/src/planning'
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
 * - Two study blocks from yesterday that didn't happen (still open), for
 *   demo step 6's "2 blocks didn't happen. Re-fit them?".
 * - Open to-dos with estimates, not yet scheduled. They add up to 12 hours,
 *   the "Your to-dos need 12." of demo step 2. Only the lab report write-up
 *   (3h) is longer than the default 2h of study time a day, so it is
 *   Auto-fill's only trim: "Shrink it to 2h?".
 * - Study Priya already planned, sized at reseed time so that Help me plan
 *   reads "About 9 hours of study time left this week (2h a day). Your to-dos need 12."
 *   (`STEP2_STUDY_LEFT_MIN`): on later days of the week only (Sat, Sun, then
 *   Fri), each up to a day's budget. With 9 hours or less left in the week
 *   (from Thursday, at 2h a day), none is planned and the copy honestly
 *   says what is left. seed-week.test.ts checks a grid of reseed times
 *   through the real planning code.
 *
 * The weekly blocks are anchored on the London week containing `now`. Each
 * deadline (and the to-do due with it) is this week's, unless that has
 * already passed, then next week's: so they are always still ahead.
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

/** Study time Help me plan should find left this week right after a reseed. */
export const STEP2_STUDY_LEFT_MIN = 9 * 60

/** Already-planned study, in the order used to bring the week down to `STEP2_STUDY_LEFT_MIN`. */
const PLANNED = [
  { id: 'seed-study-bio-reading', title: 'Biology reading: chapter 4', course: 'biology', day: 'Sat', from: '10:00' },
  { id: 'seed-study-lab-prep', title: 'Lab prep: read the method', course: 'chemistry', day: 'Sun', from: '11:00' },
  { id: 'seed-study-pre-lab', title: 'Pre-lab questions', course: 'chemistry', day: 'Fri', from: '10:00' },
] as const

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
  const base: SeedPlanItem[] = [
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

    { id: 'seed-todo-lab-write-up', kind: 'task', title: 'Lab report write-up', course: 'chemistry', duration_min: 180, due_at: labReportDue },
    { id: 'seed-todo-quiz-revision', kind: 'task', title: 'Revise for the Biology quiz', course: 'biology', duration_min: 120, due_at: quizDue },
    { id: 'seed-todo-problem-sheet', kind: 'task', title: 'Chemistry problem sheet', course: 'chemistry', duration_min: 120 },
    { id: 'seed-todo-past-paper', kind: 'task', title: 'Chemistry past paper', course: 'chemistry', duration_min: 120 },
    { id: 'seed-todo-essay-plan', kind: 'task', title: 'Plan the Biology essay', course: 'biology', duration_min: 120 },
    { id: 'seed-todo-flashcards', kind: 'task', title: 'Make flashcards: cell structure', course: 'biology', duration_min: 60 },
  ]
  return [...base, ...plannedStudy(base, now, at)]
}

/**
 * Study blocks already planned on days after today, sized so the week has
 * `STEP2_STUDY_LEFT_MIN` of study time left (to the 15 minutes below), as
 * Help me plan counts it with the default study time per day.
 */
function plannedStudy(base: SeedPlanItem[], now: number, at: (day: Day, time: string, weekOffset?: number) => string): SeedPlanItem[] {
  const week = { start: Date.parse(at('Mon', '00:00')), end: Date.parse(at('Mon', '00:00', 1)) }
  const rows = expandPlanItems(base.map(asRow), { from: new Date(week.start).toISOString(), to: new Date(week.end).toISOString() })
  const days = studyDays(weekLayout(rows, week, { timeZone: SEED_TIME_ZONE }), now)
  let excess = days.reduce((sum, d) => sum + d.leftMin, 0) - STEP2_STUDY_LEFT_MIN
  const tomorrow = startOfLocalDay(now, SEED_TIME_ZONE, 1)
  const planned: SeedPlanItem[] = []
  for (const p of PLANNED) {
    const start = Date.parse(at(p.day, p.from))
    // Never today: today's study time keeps the hand-assign and Auto-fill slots.
    if (start < tomorrow) continue
    const left = days.find((d) => d.day === startOfLocalDay(start, SEED_TIME_ZONE))?.leftMin ?? 0
    const duration_min = Math.floor(Math.min(excess, left) / 15) * 15
    if (duration_min < 15) continue
    excess -= duration_min
    planned.push({
      id: p.id, kind: 'task', title: p.title, course: p.course, duration_min,
      starts_at: new Date(start).toISOString(), ends_at: new Date(start + duration_min * 60_000).toISOString(),
    })
  }
  return planned
}

/** A seed item as a stored row, to count the week the way the app does. */
function asRow(item: SeedPlanItem): PlanItem {
  return {
    starts_at: null, ends_at: null, due_at: null, duration_min: null, status: 'open', recurrence: null,
    subtype: null, source_type: null, source_id: null, source_offset_ms: null, created_by_workflow_id: null, course: null,
    ...item,
    created_at: item.created_at ?? '', updated_at: item.updated_at ?? '',
  }
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
    // The seeded confusion automation (013_lecture_ai_automations.sql).
    created_by_workflow_id: 'wf-confused-review',
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
