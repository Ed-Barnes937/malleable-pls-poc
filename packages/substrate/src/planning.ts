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
  splitByLocalDay,
  startOfLocalDay,
  subtract,
  suggestSlots,
  totalMinutes,
  type Capacity,
  type DailyBudget,
  type ExistingPlacement,
  type Interval,
  type Placement,
  type SchedulerTask,
  type Unplaced,
  type UnplacedReason,
} from '@pls/scheduler'
import type { PlanItem, PlanItemOccurrence } from './types'
import { REVIEW_SUBTYPE } from './workflows/review-automation'

const MINUTE_MS = 60_000

/**
 * The study day study time is placed in: 09:00-22:00 local, with 10 minutes
 * of breathing room around every class and shift. Help me plan and the
 * confusion automation both place inside it.
 */
export const STUDY_DAY = { dayStart: '09:00', dayEnd: '22:00', bufferMin: 10 } as const

/** Gap kept between two study blocks, so a draft never runs them back to back. */
export const STUDY_BLOCK_GAP_MIN = 10

/**
 * Default "study time per day": the most Help me plan fills into one day,
 * counting study blocks already there. A Calendar setting (1h to 6h), so a
 * plan is one a student would follow, not every free minute 09:00-22:00.
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

type Row = Pick<PlanItem, 'id' | 'kind' | 'status' | 'starts_at' | 'ends_at' | 'subtype'>

/**
 * The calendar's fixed time, from the items of a range (`listPlanItems` with
 * `from`/`to`, so weekly classes are expanded): every commitment of every
 * course, plus every other time block (open or done to-dos, accepted study
 * time), which is busy but is not a commitment. Items in `moving` are the
 * ones being placed, so their current blocks don't count. Reviews are padded
 * by the study-day buffer (so two never run back to back) unless
 * `padReviews` is false, for callers that keep a gap with the scheduler's
 * `gapMin` instead.
 */
export function busyTime(
  items: ReadonlyArray<Row>,
  moving: ReadonlySet<string>,
  opts: { padReviews?: boolean } = {},
): { commitments: Interval[]; busy: ExistingPlacement[] } {
  const padReviews = opts.padReviews ?? true
  const commitments: Interval[] = []
  const busy: ExistingPlacement[] = []
  for (const item of items) {
    if (!item.starts_at || !item.ends_at || moving.has(item.id)) continue
    if (item.status === 'dismissed') continue
    const block = { start: Date.parse(item.starts_at), end: Date.parse(item.ends_at) }
    if (item.kind === 'commitment') commitments.push(block)
    else if (item.kind === 'task') {
      busy.push({ ...(padReviews && item.subtype === REVIEW_SUBTYPE ? padded(block) : block), taskId: item.id })
    }
  }
  return { commitments, busy }
}

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
  // Unpadded: drafts keep their gap with `gapMin`, and the budget counts real minutes.
  const { commitments, busy } = busyTime(rows, opts.except ?? new Set(), { padReviews: false })
  const free = freeSlots(commitments, week, { timeZone: opts.timeZone, ...STUDY_DAY })
  const budget = { minutesPerDay: opts.studyMinPerDay ?? DEFAULT_STUDY_MIN_PER_DAY, timeZone: opts.timeZone }
  return { week, timeZone: opts.timeZone, free, busy, budget }
}

/** A block with `minutes` (default: the study-day buffer) either side. */
export function padded(block: Interval, minutes: number = STUDY_DAY.bufferMin): Interval {
  const pad = minutes * MINUTE_MS
  return { start: block.start - pad, end: block.end + pad }
}

/**
 * Free time still ahead of `now`, around busy blocks (the budget is not
 * applied) and anything in `alsoBusy` (e.g. drafted blocks not saved yet).
 */
export function openTime(layout: WeekLayout, now: number, alsoBusy: ReadonlyArray<Interval> = []): Interval[] {
  return subtract(layout.free, [...layout.busy, ...alsoBusy, { start: -Infinity, end: now }])
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
// Confusion reviews
// ---------------------------------------------------------------------------

/** A review is never placed within this long of the moment being marked. */
export const REVIEW_LEAD_MIN = 60

export interface ReviewToPlace {
  id: string
  durationMin: number
  /** When the moment was marked (UTC ms): the review starts `REVIEW_LEAD_MIN` after it at the earliest. */
  markedAt: number
  /** Must end by (UTC ms). */
  latest: number
}

export type ReviewSlot = { start: number; end: number } | { reason: UnplacedReason }

/**
 * Where the confusion automation puts each review: the earliest free time in
 * its window, at least `REVIEW_LEAD_MIN` after the mark, inside the study day,
 * around every commitment (all courses) and every other block, `STUDY_BLOCK_GAP_MIN`
 * clear of other study blocks, on a day with study time left
 * (`studyMinPerDay`, Help me plan's budget). Only when no day in the window
 * has any left does it go over the budget, still in the earliest free slot;
 * it stays unscheduled only when the window has no free slot at all.
 * Earlier entries get first pick.
 * `items` covers `range` (from the local start of today, recurrences expanded);
 * the reviews being placed may all move, so their current blocks are ignored.
 * Pure: the server and tests share it.
 */
export function placeReviews(
  items: ReadonlyArray<Row>,
  reviews: ReadonlyArray<ReviewToPlace>,
  range: Interval,
  opts: { now: number; timeZone: string; studyMinPerDay?: number },
): Map<string, ReviewSlot> {
  const slots = new Map<string, ReviewSlot>()
  if (reviews.length === 0) return slots
  // Unpadded: `gapMin` keeps the gap, and the budget counts real minutes.
  const { commitments, busy } = busyTime(items, new Set(reviews.map((r) => r.id)), { padReviews: false })
  const free = freeSlots(commitments, range, { timeZone: opts.timeZone, ...STUDY_DAY })
  const budget = { minutesPerDay: opts.studyMinPerDay ?? DEFAULT_STUDY_MIN_PER_DAY, timeZone: opts.timeZone }
  const tasks = reviews.map((r) => ({ id: r.id, durationMin: r.durationMin, earliest: r.markedAt + REVIEW_LEAD_MIN * MINUTE_MS, latest: r.latest }))
  const result = placeEachOverBudgetIfNeeded(tasks, free, busy, { now: opts.now, budget })
  for (const p of result.placements) slots.set(p.taskId, { start: p.start, end: p.end })
  for (const u of result.unplaced) slots.set(u.taskId, { reason: u.reason })
  return slots
}

/**
 * The rule for blocks that must not drop off the calendar (confusion reviews,
 * decision 11; re-fitted blocks, decision 20): placed one at a time, in the
 * order given (each is busy for the next), at the earliest free time,
 * `STUDY_BLOCK_GAP_MIN` clear of other study blocks, within each day's study
 * time when any day in the task's window has room. When none has, it goes in
 * the earliest free slot anyway, over the budget; it is unplaced only when
 * its window has no free slot at all.
 */
function placeEachOverBudgetIfNeeded(
  tasks: ReadonlyArray<SchedulerTask>,
  free: ReadonlyArray<Interval>,
  busy: ReadonlyArray<ExistingPlacement>,
  opts: { now: number; budget: DailyBudget },
): DraftResult {
  const taken = [...busy]
  const placements: Placement[] = []
  const unplaced: Unplaced[] = []
  for (const task of tasks) {
    const rules = { now: opts.now, existingPlacements: taken, anchor: 'earliest' as const, gapMin: STUDY_BLOCK_GAP_MIN }
    const withinBudget = place([task], free, { ...rules, dailyBudget: opts.budget })
    const result = withinBudget.placements.length ? withinBudget : place([task], free, rules)
    const [p] = result.placements
    if (p) {
      placements.push(p)
      taken.push({ start: p.start, end: p.end, taskId: `placed:${task.id}` })
    } else {
      unplaced.push({ taskId: task.id, reason: result.unplaced[0]?.reason ?? 'no-free-slot' })
    }
  }
  return { placements, unplaced }
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
const floor15 = (min: number) => Math.floor(min / 15) * 15
/** Trims that only help an over-capacity week (to-dos that could fit as they are). */
const MAX_CAPACITY_TRIMS = 2

/** The longest a single block can be on one day: the budget, rounded down to 15 minutes. */
export function longestBlockMin(minutesPerDay: number): number {
  return Math.max(15, floor15(minutesPerDay))
}

function overBudgetTrim(task: PlanTask, perDay: number): PlanTrim {
  return {
    taskId: task.id,
    durationMin: perDay,
    reason: `Longer than your ${formatMinutes(perDay)} a day - a focused first pass fits, and you can finish it later.`,
  }
}

/**
 * The default trims: every to-do longer than a day's study time gets one
 * (it can never fit as it is), and when the week is short the longest other
 * to-do (an hour or more) shrinks towards the shortfall, never below half
 * its length or 30 minutes.
 */
export function defaultTrims(tasks: ReadonlyArray<PlanTask>, shortfallMin: number, minutesPerDay: number): PlanTrim[] {
  const perDay = longestBlockMin(minutesPerDay)
  const longest = [...tasks].sort((a, b) => b.durationMin - a.durationMin || a.title.localeCompare(b.title))
  const trims = longest.filter((t) => t.durationMin > perDay).map((t) => overBudgetTrim(t, perDay))
  if (shortfallMin > 0 && trims.length === 0) {
    const task = longest.find((t) => t.durationMin >= 60)
    if (task) {
      const durationMin = Math.max(ceil15(task.durationMin - shortfallMin), ceil15(task.durationMin / 2), 30)
      if (durationMin < task.durationMin) {
        trims.push({ taskId: task.id, durationMin, reason: 'A focused first pass fits the time you have; finish it once the week frees up.' })
      }
    }
  }
  return trims
}

/**
 * Makes a set of trims safe for this budget: rounded to 15 minutes; a
 * to-do longer than a day's study time is offered exactly that (whatever the
 * advice said, which may predate a budget change); dropped unless shorter
 * than now and at least 15 minutes; and every such to-do is guaranteed one
 * (so none is left with no way forward). Trims for to-dos that could fit as
 * they are only count when over capacity, at most two.
 */
export function completeTrims(
  trims: ReadonlyArray<PlanTrim>,
  tasks: ReadonlyArray<PlanTask>,
  opts: { overCapacity: boolean; minutesPerDay: number },
): PlanTrim[] {
  const perDay = longestBlockMin(opts.minutesPerDay)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out: PlanTrim[] = []
  let capacityTrims = 0
  for (const trim of trims) {
    const task = byId.get(trim.taskId)
    if (!task || out.some((t) => t.taskId === task.id)) continue
    const tooLong = task.durationMin > perDay
    // A to-do longer than a day shrinks to a day's study time, at the budget
    // in force now (so a new study time per day offers its own length).
    const durationMin = tooLong ? perDay : Math.round(trim.durationMin / 15) * 15
    if (!(durationMin >= 15 && durationMin < task.durationMin)) continue
    if (!tooLong && (!opts.overCapacity || capacityTrims === MAX_CAPACITY_TRIMS)) continue
    if (!tooLong) capacityTrims++
    // A too-long to-do's reason names the budget in force now, in code's words.
    const reason = tooLong ? overBudgetTrim(task, perDay).reason : clip(trim.reason, MAX_REASON_CHARS)
    out.push({ taskId: task.id, durationMin, reason })
  }
  for (const task of tasks) {
    if (task.durationMin > perDay && !out.some((t) => t.taskId === task.id)) out.push(overBudgetTrim(task, perDay))
  }
  return out
}

const MAX_NOTE_CHARS = 220
const MAX_REASON_CHARS = 160

/** An amount of time, e.g. "3h", "4 hours", "90 min", "1.5 hrs". */
const AMOUNT = /\b\d+(?:[.,]\d+)?\s*(?:h|hrs?|hours?|m|mins?|minutes?)\b/i

/**
 * The note may name priorities and suggestions, never amounts of time: the
 * numbers shown come from code, so any sentence carrying one is dropped.
 */
export function noteWithoutAmounts(note: string): string {
  return (note.match(/[^.!?]+[.!?]*/g) ?? [])
    .filter((sentence) => !AMOUNT.test(sentence))
    .join('')
    .trim()
}

/**
 * Makes advice (from a live model or a fake) safe to act on: the order holds
 * every task exactly once (unknown ids dropped, missing ones added in
 * `rankForPlan` order); trims via `completeTrims`; the note without amounts
 * of time, clipped.
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
  const trims = completeTrims(raw.trims, tasks, { overCapacity: !cap.fits, minutesPerDay })
  const note = raw.note ? clip(noteWithoutAmounts(raw.note), MAX_NOTE_CHARS) : ''
  return { order, trims, note: note || null }
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max - 3).replace(/\s+\S*$/, '')}...` : t
}

// ---------------------------------------------------------------------------
// Copy (code, not the LLM, says the numbers)
// ---------------------------------------------------------------------------

/** Rounded to 5 minutes / half hours, `down` for what is free and `up` for what is needed, so copy never hides a gap. */
function amount(min: number, round: 'down' | 'up'): { n: string; unit: 'hour' | 'minute' } {
  const r = round === 'down' ? Math.floor : Math.ceil
  if (min < 60) return { n: String(Math.max(5, r(min / 5) * 5)), unit: 'minute' }
  const hours = r((min / 60) * 2) / 2
  return { n: String(hours), unit: 'hour' }
}

const plural = (n: string, unit: string) => `${unit}${n === '1' ? '' : 's'}`

/**
 * "About 9 hours of study time left this week (2h a day). Your to-dos need
 * 12." `when` names the week ("this week", "next week", "that week").
 * `minutesPerDay` names the daily cap the free time is counted with, the
 * same one Auto-fill drafts with, so a draft that leaves something out
 * never contradicts the headline.
 */
export function capacityCopy(cap: Pick<Capacity, 'freeMin' | 'neededMin'>, when = 'this week', minutesPerDay?: number): string {
  const free = amount(cap.freeMin, 'down')
  const perDay = minutesPerDay ? ` (${formatMinutes(minutesPerDay)} a day)` : ''
  const freePart = cap.freeMin <= 0
    ? `No study time left ${when}${perDay}.`
    : `About ${free.n} ${plural(free.n, free.unit)} of study time left ${when}${perDay}.`
  if (cap.neededMin <= 0) return `${freePart} Nothing left to plan.`
  const need = amount(cap.neededMin, 'up')
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

/**
 * The draft's own numbers, from what was actually placed: "Drafted 6h of
 * study time. 2h 30m didn't fit." Never from capacity or the LLM, so it can't
 * contradict the ghosts beside it. `leftover` (see `leftoverStudyTime`) is
 * study time the headline counts that the draft couldn't use, each part
 * named for its real reason, so drafted + leftover adds up to the headline,
 * except for what `leftoverStudyTime` can't explain and any part under 15
 * minutes, which go unnamed (so the sum can fall short there).
 * `unplacedCount` is how many to-dos didn't fit ("for it" / "for them").
 */
export function draftCopy(placedMin: number, unplacedMin: number, leftover: Leftover = NO_LEFTOVER, unplacedCount = 1): string {
  const drafted = placedMin > 0 ? `Drafted ${formatMinutes(placedMin)} of study time.` : 'Nothing fits as it is.'
  if (unplacedMin <= 0) return `${drafted} Everything fits.`
  const missed = `${drafted} ${formatMinutes(unplacedMin)} didn't fit.`
  const gaps = leftover.gapMin >= 15 ? leftover.gapMin : 0
  const days = leftover.dayMin >= 15 ? leftover.dayMin : 0
  if (!gaps && !days) return missed
  const the = placedMin > 0 ? 'The other' : 'The'
  const them = unplacedCount === 1 ? 'it' : 'them'
  const inGaps = `of free time is in gaps too short for ${them}`
  const onDays = `is on days with too little study time left for ${them}`
  if (gaps && days) return `${missed} ${the} ${formatMinutes(gaps)} ${inGaps}, and ${formatMinutes(days)} ${onDays}.`
  return `${missed} ${the} ${formatMinutes(gaps || days)} ${gaps ? inGaps : onDays}.`
}

/** Study time a draft left unused, by why (see `leftoverStudyTime`). */
export interface Leftover {
  /** On days with budget enough, but in gaps shorter than any to-do left. */
  gapMin: number
  /** On days whose study time left (the daily budget) is less than any to-do left. */
  dayMin: number
}

const NO_LEFTOVER: Leftover = { gapMin: 0, dayMin: 0 }

/**
 * The study time each day still has once `drafted` is in (as the headline
 * counts it: free time capped by the day's budget), split by why the to-dos
 * left over (`unplaced`) can't use it: a day whose budget left is shorter
 * than the shortest of them (`dayMin`: the binding cause, even when its gaps
 * are short too), or else a day whose free gaps, 10 minutes clear of study
 * blocks, are all shorter than it (`gapMin`). So short gaps are never blamed
 * for the daily budget.
 * Only when every one of them simply found no slot: any other reason (too
 * long for a day, due too soon) is named on its own line instead, so both
 * are 0. Time neither explains (a day with a long enough gap and budget
 * left that the to-dos still couldn't use) is not blamed on anything and
 * goes unnamed, as does a part under 15 minutes (`draftCopy`): there the
 * draft's numbers fall short of the headline's.
 */
export function leftoverStudyTime(
  layout: WeekLayout,
  now: number,
  drafted: ReadonlyArray<Interval>,
  unplaced: ReadonlyArray<{ durationMin: number; reason: UnplacedReason }>,
): Leftover {
  if (unplaced.length === 0 || unplaced.some((u) => u.reason !== 'no-free-slot')) return NO_LEFTOVER
  const need = Math.min(...unplaced.map((u) => u.durationMin))
  let gapMin = 0
  let dayMin = 0
  for (const d of roomByDay(layout, now, drafted)) {
    if (d.budgetLeftMin < need) dayMin += d.leftMin
    else if (d.longestGapMin < need) gapMin += d.leftMin
  }
  return { gapMin, dayMin }
}

/**
 * Why a to-do of `durationMin` found no slot (`no-free-slot`) once `drafted`
 * is in, by the same rule as `leftoverStudyTime`: `'budget'` when no day with
 * free time ahead has that much of its study time left, else `'gaps'` (the
 * days that have the study time have no gap that long, or no day has free
 * time at all).
 */
export function noSlotCause(layout: WeekLayout, now: number, drafted: ReadonlyArray<Interval>, durationMin: number): 'budget' | 'gaps' {
  const days = roomByDay(layout, now, drafted)
  return days.length > 0 && days.every((d) => d.budgetLeftMin < durationMin) ? 'budget' : 'gaps'
}

/**
 * Each day with free time ahead once `drafted` is in: its study time left
 * (as the headline counts it, possibly 0), the budget it has left, and its
 * longest free gap, 10 minutes clear of study blocks.
 */
function roomByDay(layout: WeekLayout, now: number, drafted: ReadonlyArray<Interval>) {
  const after: WeekLayout = { ...layout, busy: [...layout.busy, ...drafted] }
  const used = minutesByDay(after.busy, layout.timeZone)
  const open = subtract(layout.free, [...after.busy.map((b) => padded(b, STUDY_BLOCK_GAP_MIN)), { start: -Infinity, end: now }])
  const longest = new Map<number, number>()
  for (const p of splitByLocalDay(open, layout.timeZone)) {
    longest.set(p.day, Math.max(longest.get(p.day) ?? 0, (p.end - p.start) / MINUTE_MS))
  }
  return studyDays(after, now)
    .filter((d) => d.freeMin > 0)
    .map((d) => ({
      leftMin: d.leftMin,
      budgetLeftMin: layout.budget.minutesPerDay - (used.get(d.day) ?? 0),
      longestGapMin: longest.get(d.day) ?? 0,
    }))
}

// ---------------------------------------------------------------------------
// Re-fit: study blocks whose time passed without being done
// ---------------------------------------------------------------------------

/**
 * A block that didn't happen: an open, one-off to-do whose time block has
 * ended. Never a commitment (those are never moved), never a recurring item,
 * never one ticked off or dismissed.
 */
export function isMissedBlock(item: PlanItem, now: number): boolean {
  return item.kind === 'task'
    && item.status === 'open'
    && item.recurrence == null
    && item.starts_at != null
    && item.ends_at != null
    && Date.parse(item.ends_at) <= now
}

/** Re-fit looks this far ahead for free time (further if a to-do is due later). */
export const REFIT_LOOKAHEAD_DAYS = 7

/** Where re-fit may put the missed blocks: the user's local today to the look-ahead (or the latest due date). */
export function refitRange(missed: ReadonlyArray<PlanItem>, opts: { now: number; timeZone: string }): Interval {
  const start = startOfLocalDay(opts.now, opts.timeZone)
  let end = startOfLocalDay(opts.now, opts.timeZone, REFIT_LOOKAHEAD_DAYS + 1)
  for (const item of missed) {
    const due = latestFor(item, opts.now)
    if (due !== undefined && due > end) end = due
  }
  return { start, end }
}

export interface RefitProposal {
  item: PlanItem
  /** The new block, or null when it doesn't fit (see `reason`). */
  starts_at: string | null
  ends_at: string | null
  reason: UnplacedReason | null
}

/**
 * New times for the missed blocks, oldest first, by the confusion reviews'
 * rule (`placeEachOverBudgetIfNeeded`, decision 20) over Help me plan's week
 * (`weekLayout`): the earliest free fit from now inside the study day, around
 * every commitment and every other block in `items` (the range from
 * `refitRange`, expanded), 10 minutes clear of other study blocks, within
 * each day's study time (the default 2h, as the server's review placement
 * uses) when any day before it is due has room, else over it. A to-do still
 * due later must fit before it is due; one whose due date has passed just
 * goes in the next free time. Read-only.
 */
export function planRefit(
  missed: ReadonlyArray<PlanItem>,
  items: ReadonlyArray<PlanItemOccurrence>,
  opts: { now: number; timeZone: string },
): RefitProposal[] {
  if (missed.length === 0) return []
  const range = refitRange(missed, opts)
  const oldestFirst = [...missed].sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!) || a.id.localeCompare(b.id))
  const layout = weekLayout(items, range, { timeZone: opts.timeZone, except: new Set(missed.map((m) => m.id)) })
  const result = placeEachOverBudgetIfNeeded(
    oldestFirst.map((item) => ({
      id: item.id,
      // A block keeps its length when the to-do has no estimate.
      durationMin: item.duration_min ?? (Date.parse(item.ends_at!) - Date.parse(item.starts_at!)) / MINUTE_MS,
      latest: latestFor(item, opts.now) ?? range.end,
    })),
    layout.free,
    layout.busy,
    { now: opts.now, budget: layout.budget },
  )
  const placed = new Map(result.placements.map((p) => [p.taskId, p]))
  const unplaced = new Map(result.unplaced.map((u) => [u.taskId, u.reason]))
  return oldestFirst
    .map((item) => {
      const p = placed.get(item.id)
      return p
        ? { item, starts_at: new Date(p.start).toISOString(), ends_at: new Date(p.end).toISOString(), reason: null }
        : { item, starts_at: null, ends_at: null, reason: unplaced.get(item.id) ?? 'no-free-slot' }
    })
}

/** The to-do's due time if it is still ahead; a passed due date no longer limits where it goes. */
function latestFor(item: PlanItem, now: number): number | undefined {
  if (!item.due_at) return undefined
  const due = Date.parse(item.due_at)
  return due > now ? due : undefined
}

/**
 * Why an accepted re-fit block can't be written as proposed (the week changed
 * since the preview), or null if it still fits: it starts in the past, or
 * overlaps a commitment or another block (including another accepted one).
 */
export function refitConflict(
  block: Interval,
  others: ReadonlyArray<Interval>,
  now: number,
): 'started' | 'overlaps' | null {
  if (block.start < now) return 'started'
  if (others.some((o) => o.start < block.end && block.start < o.end)) return 'overlaps'
  return null
}
