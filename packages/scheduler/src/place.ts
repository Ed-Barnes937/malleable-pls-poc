import { MINUTE_MS, subtract, type Interval } from './intervals'
import { checkBudget, minutesByDay, splitByLocalDay, type DailyBudget } from './budget'

/** Something that needs a contiguous block of time. */
export interface SchedulerTask {
  id: string
  durationMin: number
  /** The block may not start before this instant (UTC ms). */
  earliest?: number
  /** The block must end by this instant (UTC ms), e.g. a due date. */
  latest?: number
}

/** A time block already on the calendar (accepted study time, a placed task). */
export interface ExistingPlacement extends Interval {
  /**
   * The task this block belongs to. When that task is among the tasks being
   * placed, its old block is ignored so the task can move (re-place on param
   * change); otherwise the block is treated as busy and never moved.
   */
  taskId?: string
}

export interface Placement extends Interval {
  taskId: string
}

export type UnplacedReason =
  /** `durationMin` is not a finite number > 0. */
  | 'invalid-duration'
  /** Between `max(now, earliest)` and `latest` there is less time than the task needs. */
  | 'window-closed'
  /** The window is open, but no free gap inside it is long enough. */
  | 'no-free-slot'
  /** Another task with the same `id` was considered first and placed or reported. */
  | 'duplicate-id'
  /** Longer than `dailyBudget.minutesPerDay`: it can never fit in one day's study time. */
  | 'over-daily-budget'

export interface Unplaced {
  taskId: string
  reason: UnplacedReason
}

export interface PlaceOptions {
  /** The current instant (UTC ms). Nothing is placed before it. */
  now: number
  /** Blocks already on the calendar, never overlapped (see `ExistingPlacement.taskId`). */
  existingPlacements?: ReadonlyArray<ExistingPlacement>
  /**
   * Order tasks are given first pick of free time:
   * - `'priority'` (default): the order of the `tasks` array, so a caller (or
   *   an AI ranking) decides what matters most and code decides where it goes.
   * - `'deadline'`: earliest `latest` first (no deadline last), ties keep
   *   array order.
   */
  policy?: 'priority' | 'deadline'
  /**
   * Where in its window each task goes:
   * - `'earliest'` (default): the earliest aligned start that fits.
   * - `'latest'`: the latest aligned start that still ends by `latest`, e.g.
   *   a spaced review that lets a lecture settle before revisiting it. A task
   *   with no `latest` then goes at the end of the supplied free time.
   */
  anchor?: 'earliest' | 'latest'
  /**
   * Block starts are rounded up to a multiple of this many minutes since the
   * epoch. Every real time zone offset is a multiple of 15 minutes, so the
   * default of 15 gives local :00/:15/:30/:45 starts everywhere. Use 1 to
   * disable rounding.
   */
  alignMin?: number
  /**
   * Minutes kept clear between a new block and any fixed existing placement
   * or other new block, so study blocks never run back to back. Default 0.
   * (Space around commitments is `freeSlots`' `bufferMin`.)
   */
  gapMin?: number
  /**
   * Caps study time per local day. Fixed existing placements count against
   * the day they fall on (before `now` too: what is already scheduled
   * today is spent). With a budget, a block never crosses local midnight.
   */
  dailyBudget?: DailyBudget
}

export interface PlaceResult {
  /** In the order tasks were considered (see `policy`). */
  placements: Placement[]
  /** In the order tasks were considered (see `policy`). */
  unplaced: Unplaced[]
}

interface Window {
  lo: number
  hi: number
  durMs: number
}

function checkOptions(opts: PlaceOptions): number {
  if (!Number.isFinite(opts.now)) throw new RangeError(`now must be a finite UTC ms value`)
  const alignMin = opts.alignMin ?? 15
  if (!(alignMin > 0) || !Number.isFinite(alignMin)) {
    throw new RangeError(`alignMin must be a finite number > 0, got ${alignMin}`)
  }
  const gapMin = opts.gapMin ?? 0
  if (!(gapMin >= 0) || !Number.isFinite(gapMin)) {
    throw new RangeError(`gapMin must be a finite number >= 0, got ${gapMin}`)
  }
  checkBudget(opts.dailyBudget)
  return alignMin * MINUTE_MS
}

function resolveWindow(task: SchedulerTask, now: number): Window | UnplacedReason {
  if (!(task.durationMin > 0) || !Number.isFinite(task.durationMin)) return 'invalid-duration'
  const durMs = task.durationMin * MINUTE_MS
  const lo = Math.max(now, task.earliest ?? now)
  const hi = task.latest ?? Infinity
  if (lo + durMs > hi) return 'window-closed'
  return { lo, hi, durMs }
}

/** Existing placements that stay put: those not belonging to `movingIds`. */
export function fixedPlacements(
  existing: ReadonlyArray<ExistingPlacement>,
  movingIds: ReadonlySet<string>,
): ExistingPlacement[] {
  return existing.filter((e) => e.taskId === undefined || !movingIds.has(e.taskId))
}

/**
 * Where new blocks may go: free time minus fixed blocks (padded by
 * `gapMin`), and, with a daily budget, the study minutes left per day.
 * `take` records a new block so later tasks see it as busy and spent.
 */
class Availability {
  private avail: Interval[]
  private readonly used: Map<number, number>
  private readonly gapMs: number

  constructor(
    free: ReadonlyArray<Interval>,
    fixed: ReadonlyArray<Interval>,
    private readonly opts: Pick<PlaceOptions, 'gapMin' | 'dailyBudget'>,
  ) {
    this.gapMs = (opts.gapMin ?? 0) * MINUTE_MS
    this.avail = subtract(free, fixed.map((b) => this.pad(b)))
    this.used = opts.dailyBudget ? minutesByDay(fixed, opts.dailyBudget.timeZone) : new Map()
  }

  private pad(b: Interval): Interval {
    return { start: b.start - this.gapMs, end: b.end + this.gapMs }
  }

  /** Free gaps a block of `durMs` may use: whole gaps, or per-day pieces with budget left. */
  gaps(durMs: number): Interval[] {
    const budget = this.opts.dailyBudget
    if (!budget) return this.avail
    return splitByLocalDay(this.avail, budget.timeZone).filter(
      (p) => budget.minutesPerDay - (this.used.get(p.day) ?? 0) >= durMs / MINUTE_MS,
    )
  }

  take(block: Interval): void {
    this.avail = subtract(this.avail, [this.pad(block)])
    const budget = this.opts.dailyBudget
    if (!budget) return
    for (const [day, min] of minutesByDay([block], budget.timeZone)) {
      this.used.set(day, (this.used.get(day) ?? 0) + min)
    }
  }
}

function overBudget(task: SchedulerTask, budget: DailyBudget | undefined): boolean {
  return !!budget && task.durationMin > budget.minutesPerDay
}

type Anchor = NonNullable<PlaceOptions['anchor']>

/** Earliest (or latest) aligned start in `slot` that fits the window, or undefined. */
function fitIn(slot: Interval, w: Window, alignMs: number, anchor: Anchor): number | undefined {
  const lo = Math.max(slot.start, w.lo)
  const hi = Math.min(slot.end, w.hi)
  const start =
    anchor === 'latest'
      ? Math.floor((hi - w.durMs) / alignMs) * alignMs
      : Math.ceil(lo / alignMs) * alignMs
  // An unbounded free slot with no deadline has no latest start.
  return Number.isFinite(start) && start >= lo && start + w.durMs <= hi ? start : undefined
}

/** Free gaps in the order the anchor prefers them. */
function byAnchor(slots: Interval[], anchor: Anchor): Interval[] {
  return anchor === 'latest' ? [...slots].reverse() : slots
}

function ordered(tasks: ReadonlyArray<SchedulerTask>, policy: PlaceOptions['policy']) {
  const list = [...tasks]
  if (policy === 'deadline') {
    // Array.prototype.sort is stable, so ties keep the caller's order.
    list.sort((a, b) => (a.latest ?? Infinity) - (b.latest ?? Infinity))
  }
  return list
}

/**
 * Fit tasks into free time, one contiguous block each, earliest-fit by
 * default (latest-fit with `anchor: 'latest'`).
 *
 * Guarantees: every placement lies inside `freeSlots` (so never overlaps a
 * commitment), never overlaps a fixed existing placement or another new
 * placement, starts at or after `max(now, earliest)` and ends by `latest`.
 * Pure and deterministic. Feeding the result back as `existingPlacements`
 * with the same inputs returns the same placements (idempotent).
 *
 * Tie-breaks: tasks in `policy` order; within a task, the earliest (or
 * latest, per `anchor`) aligned start wins. If two tasks share an `id`, the
 * first one considered is handled and the rest are `'duplicate-id'`.
 *
 * Every task in `tasks` is movable: its own existing placement is ignored.
 * Never pass a task whose block the student accepted or dragged unless you
 * mean to move it; leave it out and pass its block in `existingPlacements`.
 */
export function place(
  tasks: ReadonlyArray<SchedulerTask>,
  freeSlots: ReadonlyArray<Interval>,
  opts: PlaceOptions,
): PlaceResult {
  const alignMs = checkOptions(opts)
  const moving = new Set(tasks.map((t) => t.id))
  const avail = new Availability(freeSlots, fixedPlacements(opts.existingPlacements ?? [], moving), opts)
  const anchor = opts.anchor ?? 'earliest'
  const placements: Placement[] = []
  const unplaced: Unplaced[] = []
  const seen = new Set<string>()

  for (const task of ordered(tasks, opts.policy)) {
    if (seen.has(task.id)) {
      unplaced.push({ taskId: task.id, reason: 'duplicate-id' })
      continue
    }
    seen.add(task.id)
    const w = resolveWindow(task, opts.now)
    if (typeof w === 'string') {
      unplaced.push({ taskId: task.id, reason: w })
      continue
    }
    if (overBudget(task, opts.dailyBudget)) {
      unplaced.push({ taskId: task.id, reason: 'over-daily-budget' })
      continue
    }
    let start: number | undefined
    for (const slot of byAnchor(avail.gaps(w.durMs), anchor)) {
      start = fitIn(slot, w, alignMs, anchor)
      if (start !== undefined) break
    }
    if (start === undefined) {
      unplaced.push({ taskId: task.id, reason: 'no-free-slot' })
      continue
    }
    const block = { taskId: task.id, start, end: start + w.durMs }
    placements.push(block)
    avail.take(block)
  }
  return { placements, unplaced }
}

/**
 * Up to `n` candidate blocks for one task, for "pick a slot" UIs: one fit
 * per separate free gap, in the anchor's preference order (earliest first
 * by default, latest first with `anchor: 'latest'`), so the first
 * suggestion is where `place` would put the task on its own. Because each
 * gap offers at most one candidate, suggestions spread across the week
 * rather than stacking up in one long afternoon. Empty when the task cannot
 * be placed at all (use `place` to learn why).
 */
export function suggestSlots(
  task: SchedulerTask,
  freeSlots: ReadonlyArray<Interval>,
  n: number,
  opts: Omit<PlaceOptions, 'policy'>,
): Placement[] {
  const alignMs = checkOptions(opts)
  const w = resolveWindow(task, opts.now)
  const out: Placement[] = []
  if (typeof w === 'string' || overBudget(task, opts.dailyBudget)) return out
  const anchor = opts.anchor ?? 'earliest'
  const avail = new Availability(freeSlots, fixedPlacements(opts.existingPlacements ?? [], new Set([task.id])), opts)
  for (const slot of byAnchor(avail.gaps(w.durMs), anchor)) {
    if (out.length >= n) break
    const start = fitIn(slot, w, alignMs, anchor)
    if (start !== undefined) out.push({ taskId: task.id, start, end: start + w.durMs })
  }
  return out
}
