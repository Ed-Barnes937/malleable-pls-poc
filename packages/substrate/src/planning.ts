/**
 * Planning a week ("Help me plan" / Auto-fill): the one place that turns plan
 * items into scheduler inputs, so the Calendar (capacity bar, suggested
 * slots, ghost drafts), the server (the Auto-fill prompt) and the confusion
 * automation all agree on the study day, on what is busy and on what fits.
 *
 * "AI suggests, code decides": an LLM may rank the to-dos and suggest trims
 * (`PlanAdvice`), but every time block comes from `@pls/scheduler` via
 * `draftPlan`, and every number shown to the student comes from `capacity`.
 */
import { z } from 'zod'
import {
  capacity,
  freeSlots,
  minutesByDay,
  place,
  subtract,
  suggestSlots,
  totalMinutes,
  type Capacity,
  type DailyBudget,
  type ExistingPlacement,
  type Interval,
  type Placement,
  type Unplaced,
} from '@pls/scheduler'
import type { PlanItem } from './types'
import { REVIEW_SUBTYPE } from './workflows/review-automation'

const MINUTE_MS = 60_000

/**
 * The study day study time is placed in: 08:00-22:00 local, with 10 minutes
 * of breathing room around every class and shift.
 */
export const STUDY_DAY = { dayStart: '08:00', dayEnd: '22:00', bufferMin: 10 } as const

/** Gap kept between two study blocks, so a draft never runs them back to back. */
export const STUDY_BLOCK_GAP_MIN = 10

/**
 * Default "study time per day": the most Help me plan fills into one day,
 * counting study blocks already there. A Calendar setting (1h to 6h), so a
 * plan is one a student would follow, not every free minute 08:00-22:00.
 */
export const DEFAULT_STUDY_MIN_PER_DAY = 120
export const STUDY_PER_DAY_OPTIONS = [60, 90, 120, 180, 240, 300, 360] as const

/** Used for a to-do with no estimate when the student skips giving one. */
export const ASSUMED_ESTIMATE_MIN = 60

/** Quick estimate choices offered for a to-do with none. */
export const ESTIMATE_OPTIONS = [30, 60, 120] as const

// ---------------------------------------------------------------------------
// The week's shape: free time and what is already busy
// ---------------------------------------------------------------------------

type Row = Pick<PlanItem, 'id' | 'kind' | 'status' | 'starts_at' | 'ends_at'>

export interface WeekLayout {
  week: Interval
  timeZone: string
  /** Study-day time around every commitment (all courses), before `now` included. */
  free: Interval[]
  /** Scheduled study time (open or done): fixed, busy, and spent from its day's budget. */
  busy: ExistingPlacement[]
  /** Study time per local day. */
  budget: DailyBudget
}

/**
 * The week's free study time and busy blocks from its plan item rows
 * (recurrences expanded, every course: scope never changes what is busy).
 * Commitments are never moved; scheduled to-dos are fixed. `except` leaves
 * out rows whose blocks may move (e.g. the ones being re-placed).
 */
export function weekLayout(
  rows: ReadonlyArray<Row>,
  week: Interval,
  opts: { timeZone: string; studyMinPerDay?: number; except?: ReadonlySet<string> },
): WeekLayout {
  const commitments: Interval[] = []
  const busy: ExistingPlacement[] = []
  for (const row of rows) {
    if (!row.starts_at || !row.ends_at || row.status === 'dismissed' || opts.except?.has(row.id)) continue
    const block = { start: Date.parse(row.starts_at), end: Date.parse(row.ends_at) }
    if (row.kind === 'commitment') commitments.push(block)
    else if (row.kind === 'task') busy.push({ ...block, taskId: row.id })
  }
  const free = freeSlots(commitments, week, { timeZone: opts.timeZone, ...STUDY_DAY })
  const budget = { minutesPerDay: opts.studyMinPerDay ?? DEFAULT_STUDY_MIN_PER_DAY, timeZone: opts.timeZone }
  return { week, timeZone: opts.timeZone, free, busy, budget }
}

export function padded(block: Interval, minutes: number): Interval {
  const pad = minutes * MINUTE_MS
  return { start: block.start - pad, end: block.end + pad }
}

/** Free time still ahead of `now`, around busy blocks (the budget is not applied). */
export function openTime(layout: WeekLayout, now: number): Interval[] {
  return subtract(layout.free, [...layout.busy, { start: -Infinity, end: now }])
}

export interface StudyDay {
  /** Local midnight (UTC ms). */
  day: number
  /** Free minutes left in the study day. */
  freeMin: number
  /** Study minutes left: free time, capped by the day's budget minus study already scheduled. */
  leftMin: number
}

/** Per local day of the week: free time and study time left. */
export function studyDays(layout: WeekLayout, now: number): StudyDay[] {
  const free = minutesByDay(openTime(layout, now), layout.timeZone)
  const used = minutesByDay(layout.busy, layout.timeZone)
  const days = minutesByDay([layout.week], layout.timeZone)
  return [...days.keys()].map((day) => {
    const freeMin = Math.floor(free.get(day) ?? 0)
    const leftMin = Math.max(0, Math.min(freeMin, layout.budget.minutesPerDay - (used.get(day) ?? 0)))
    return { day, freeMin, leftMin: Math.floor(leftMin) }
  })
}

// ---------------------------------------------------------------------------
// To-dos as scheduler tasks
// ---------------------------------------------------------------------------

type Todo = Pick<PlanItem, 'id' | 'title' | 'course' | 'due_at' | 'duration_min' | 'subtype'>

/** A to-do ready to plan: its length (estimate, or assumed) and the latest it may end. */
export interface PlanTask {
  id: string
  title: string
  course: string | null
  dueAt: string | null
  durationMin: number
  /** No estimate was given: `durationMin` is assumed (say so). */
  assumed: boolean
  /** Linked to a weak topic (a review of a confusing moment, or a low-confidence topic). */
  weakTopic: boolean
  /** Must end by (UTC ms): its due time if that is inside the week, else the week's end. */
  latest: number
}

/**
 * The week's planning tasks for unscheduled open to-dos. A due time before
 * the week (or before `now`) does not close the window: something still to
 * do is planned for this week, calmly, rather than dropped.
 */
export function planTasks(
  todos: ReadonlyArray<Todo>,
  week: Interval,
  opts: { now: number; estimates?: Readonly<Record<string, number>>; weakTopics?: ReadonlyArray<string> },
): PlanTask[] {
  const floor = Math.max(opts.now, week.start)
  return todos.map((t) => {
    const due = t.due_at ? Date.parse(t.due_at) : null
    const given = t.duration_min ?? opts.estimates?.[t.id] ?? null
    return {
      id: t.id,
      title: t.title,
      course: t.course,
      dueAt: t.due_at,
      durationMin: given ?? ASSUMED_ESTIMATE_MIN,
      assumed: t.duration_min == null,
      weakTopic: matchesWeakTopic(t, opts.weakTopics ?? []),
      latest: due != null && due > floor && due < week.end ? due : week.end,
    }
  })
}

const STOP_WORDS = new Set(['about', 'their', 'there', 'these', 'those', 'which', 'would', 'review', 'notes', 'reading', 'write'])

function words(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !STOP_WORDS.has(w)),
  )
}

/** A review of a confusing moment, or a title sharing a meaningful word with a weak topic. */
export function matchesWeakTopic(todo: Pick<Todo, 'title' | 'subtype'>, weakTopics: ReadonlyArray<string>): boolean {
  if (todo.subtype === REVIEW_SUBTYPE) return true
  const title = words(todo.title)
  return weakTopics.some((topic) => [...words(topic)].some((w) => title.has(w)))
}

/**
 * Study time left (free time, capped per day by the budget) versus what the
 * to-dos need, for the copy. Never place with this: `draftPlan` is the truth.
 */
export function planCapacity(layout: WeekLayout, tasks: ReadonlyArray<PlanTask>, now: number): Capacity {
  return capacity(layout.free, tasks, { now, existingPlacements: layout.busy, dailyBudget: layout.budget })
}

// ---------------------------------------------------------------------------
// Placing
// ---------------------------------------------------------------------------

export interface DraftResult {
  /** In priority order. */
  placements: Placement[]
  unplaced: Unplaced[]
}

/**
 * Places `tasks` in the order given (an AI ranking, or `rankForPlan`),
 * earliest-fit around everything busy, within each day's study budget and
 * with a gap between blocks. `pinned` are blocks to keep where they are
 * (e.g. ghosts the student dragged); they count as busy and spent.
 */
export function draftPlan(
  tasks: ReadonlyArray<Pick<PlanTask, 'id' | 'durationMin' | 'latest'>>,
  layout: WeekLayout,
  opts: { now: number; pinned?: ReadonlyArray<Placement> },
): DraftResult {
  const pinned = (opts.pinned ?? []).map((p) => ({ start: p.start, end: p.end, taskId: `pinned:${p.taskId}` }))
  return place(
    tasks.map((t) => ({ id: t.id, durationMin: t.durationMin, latest: t.latest })),
    layout.free,
    { now: opts.now, existingPlacements: [...layout.busy, ...pinned], ...placeRules(layout) },
  )
}

function placeRules(layout: WeekLayout) {
  return { policy: 'priority' as const, gapMin: STUDY_BLOCK_GAP_MIN, dailyBudget: layout.budget }
}

/** Up to `n` slots for assigning one to-do by hand, each in a different free gap. */
export function suggestTaskSlots(
  task: Pick<PlanTask, 'id' | 'durationMin' | 'latest'>,
  layout: WeekLayout,
  opts: { now: number; n?: number },
): Placement[] {
  return suggestSlots(
    { id: task.id, durationMin: task.durationMin, latest: task.latest },
    layout.free,
    opts.n ?? 3,
    { now: opts.now, existingPlacements: layout.busy, gapMin: STUDY_BLOCK_GAP_MIN, dailyBudget: layout.budget },
  )
}

// ---------------------------------------------------------------------------
// Ranking and trims (the deterministic default; the LLM may do better)
// ---------------------------------------------------------------------------

/**
 * Deterministic priority: soonest due first (no due date last), then weak
 * topics, then shorter first, then title. Used by the mock LLM, and to slot
 * in any to-do a live reply left out.
 */
export function rankForPlan(tasks: ReadonlyArray<PlanTask>): string[] {
  return [...tasks]
    .sort((a, b) =>
      (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity)
      || Number(b.weakTopic) - Number(a.weakTopic)
      || a.durationMin - b.durationMin
      || a.title.localeCompare(b.title)
      || a.id.localeCompare(b.id))
    .map((t) => t.id)
}

export interface PlanTrim {
  taskId: string
  /** The suggested new length. */
  durationMin: number
  /** One short line, e.g. "A focused first draft fits the time you have." */
  reason: string
}

export interface PlanAdvice {
  /** Every task id, most important first. */
  order: string[]
  /** Only when the to-dos need more time than is free. */
  trims: PlanTrim[]
  /** One short, honest line about the week, or null. */
  note: string | null
}

const ceil15 = (min: number) => Math.ceil(min / 15) * 15
const MAX_TRIMS = 2

const floor15 = (min: number) => Math.floor(min / 15) * 15

/**
 * The default trims: when over capacity, shrink the longest to-do (an hour
 * or more) towards the shortfall, never below half its length or 30
 * minutes; and any to-do longer than a day's study time to fit in one day.
 * At most two, longest first.
 */
export function defaultTrims(tasks: ReadonlyArray<PlanTask>, shortfallMin: number, minutesPerDay: number): PlanTrim[] {
  const perDay = Math.max(15, floor15(minutesPerDay))
  const longest = [...tasks].sort((a, b) => b.durationMin - a.durationMin || a.title.localeCompare(b.title))
  const trims: PlanTrim[] = []
  for (const task of longest) {
    if (trims.length === MAX_TRIMS) break
    const tooLong = task.durationMin > perDay
    const shrink = shortfallMin > 0 && trims.length === 0 && task.durationMin >= 60
    if (!tooLong && !shrink) continue
    let durationMin = task.durationMin
    if (shrink) durationMin = Math.max(ceil15(task.durationMin - shortfallMin), ceil15(task.durationMin / 2), 30)
    durationMin = Math.min(durationMin, perDay)
    if (durationMin >= task.durationMin) continue
    trims.push({
      taskId: task.id,
      durationMin,
      reason: tooLong
        ? `Longer than your ${formatMinutes(perDay)} a day - a focused first pass fits, and you can finish it later.`
        : 'A focused first pass fits the time you have; finish it once the week frees up.',
    })
  }
  return trims
}

const MAX_NOTE_CHARS = 220
const MAX_REASON_CHARS = 160

/**
 * Makes advice (from a live model or a fake) safe to act on: the order holds
 * every task exactly once (unknown ids dropped, missing ones added in
 * `rankForPlan` order); trims only for known tasks, only when over capacity
 * or for a to-do longer than a day's study time, shorter than now, at least
 * 15 minutes and rounded to 15; text trimmed.
 */
export function sanitizeAdvice(
  raw: PlanAdvice,
  tasks: ReadonlyArray<PlanTask>,
  cap: Capacity,
  minutesPerDay: number,
): PlanAdvice {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const order: string[] = []
  for (const id of [...raw.order, ...rankForPlan(tasks)]) {
    if (byId.has(id) && !order.includes(id)) order.push(id)
  }
  const trims: PlanTrim[] = []
  for (const trim of raw.trims) {
    const task = byId.get(trim.taskId)
    const durationMin = Math.round(trim.durationMin / 15) * 15
    if (!task || trims.some((t) => t.taskId === trim.taskId)) continue
    if (cap.fits && task.durationMin <= minutesPerDay) continue
    if (!(durationMin >= 15 && durationMin < task.durationMin)) continue
    trims.push({ taskId: task.id, durationMin, reason: clip(trim.reason, MAX_REASON_CHARS) })
    if (trims.length === MAX_TRIMS) break
  }
  const note = raw.note ? clip(raw.note, MAX_NOTE_CHARS) : ''
  return { order, trims, note: note || null }
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max - 3).replace(/\s+\S*$/, '')}...` : t
}

// ---------------------------------------------------------------------------
// Copy (code, not the LLM, says the numbers)
// ---------------------------------------------------------------------------

function amount(min: number): { n: string; unit: 'hour' | 'minute' } {
  if (min < 60) return { n: String(Math.max(5, Math.round(min / 5) * 5)), unit: 'minute' }
  const hours = Math.round((min / 60) * 2) / 2
  return { n: String(hours), unit: 'hour' }
}

const plural = (n: string, unit: string) => `${unit}${n === '1' ? '' : 's'}`

/**
 * "About 9 hours of study time left this week. Your to-dos need 12." `when`
 * names the week ("this week", "next week", "that week").
 */
export function capacityCopy(cap: Pick<Capacity, 'freeMin' | 'neededMin'>, when = 'this week'): string {
  const free = amount(cap.freeMin)
  const freePart = cap.freeMin <= 0
    ? `No study time left ${when}.`
    : `About ${free.n} ${plural(free.n, free.unit)} of study time left ${when}.`
  if (cap.neededMin <= 0) return `${freePart} Nothing left to plan.`
  const need = amount(cap.neededMin)
  const needPart = need.unit === free.unit && cap.freeMin > 0 ? need.n : `${need.n} ${plural(need.n, need.unit)}`
  return `${freePart} Your to-dos need ${needPart}.`
}

/** "2h", "45m", "1h 30m". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ---------------------------------------------------------------------------
// Auto-fill request (shared by the server router and the CT simulator)
// ---------------------------------------------------------------------------

const isoDateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString())

export const planAutofillInput = z.object({
  /** The week being planned, [from, to). */
  from: isoDateTime,
  to: isoDateTime,
  /** IANA zone the study day is read in (the browser's). */
  timeZone: z.string().min(1).max(100).refine(isTimeZone, { message: 'Unknown time zone' }),
  /** The student's "study time per day" (the Calendar setting). */
  studyMinPerDay: z.number().int().min(15).max(14 * 60),
  /** Lengths the student accepted as assumed for to-dos with no estimate. */
  estimates: z.record(z.string().max(255), z.number().int().min(5).max(24 * 60)).optional(),
}).refine((q) => Date.parse(q.from) < Date.parse(q.to), { message: 'from must be before to' })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 8 * 24 * 60 * MINUTE_MS, { message: 'plan at most a week at a time' })

export type PlanAutofillInput = z.input<typeof planAutofillInput>

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone })
    return true
  } catch {
    return false
  }
}

export { totalMinutes, type Capacity, type Interval, type Placement, type Unplaced }
