import { MINUTE_MS, subtract, type Interval } from './intervals'
import { checkBudget, minutesByDay, splitByLocalDay, type DailyBudget } from './budget'

/** Something that needs a block of time (or, with `PlaceOptions.split`, a few sessions). */
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
  /**
   * Longer than `dailyBudget.minutesPerDay`: it can never fit in one day's
   * study time. Never given with `split`, which tries sessions instead.
   */
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
  /**
   * Lets a task that fits in no single block (no free gap is long enough,
   * or it is longer than a day's budget) be split into sessions instead.
   * See `SplitOptions`. Only with `anchor: 'earliest'`.
   */
  split?: SplitOptions
}

/**
 * How `place` splits a task into sessions: the fewest sessions that fit,
 * then the earliest ones. Each session is in a different free gap (so
 * sessions are `gapMin` apart like any two blocks), inside the task's
 * window, within each day's budget. Every session but the last is a multiple
 * of `alignMin` long; together they add up to the task's duration exactly.
 * A task that can't be fully placed this way is unplaced, never part-placed.
 */
export interface SplitOptions {
  /** The shortest session in minutes (a task shorter than this is never split). */
  minSessionMin: number
  /** At most this many sessions per task. Default 8. */
  maxSessions?: number
}

export interface PlaceResult {
  /**
   * In the order tasks were considered (see `policy`); a split task's
   * sessions are next to each other, earliest first.
   */
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
  if (opts.split) {
    const { minSessionMin, maxSessions = DEFAULT_MAX_SESSIONS } = opts.split
    if (!(minSessionMin > 0) || !Number.isFinite(minSessionMin)) {
      throw new RangeError(`split.minSessionMin must be a finite number > 0, got ${minSessionMin}`)
    }
    if (!Number.isInteger(maxSessions) || maxSessions < 1) {
      throw new RangeError(`split.maxSessions must be an integer >= 1, got ${maxSessions}`)
    }
    if ((opts.anchor ?? 'earliest') !== 'earliest') throw new RangeError(`split needs anchor 'earliest'`)
  }
  return alignMin * MINUTE_MS
}

const DEFAULT_MAX_SESSIONS = 8

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
    return this.pieces().filter((p) => this.budgetLeftMs(p.day) >= durMs)
  }

  /** Free gaps, cut at local midnight with a budget (`day` is then that local day). */
  private pieces(): (Interval & { day?: number })[] {
    const budget = this.opts.dailyBudget
    return budget ? splitByLocalDay(this.avail, budget.timeZone) : this.avail
  }

  /** Study time left on `day` (unlimited without a budget). */
  budgetLeftMs(day: number | undefined): number {
    const budget = this.opts.dailyBudget
    if (!budget || day === undefined) return Infinity
    return (budget.minutesPerDay - (this.used.get(day) ?? 0)) * MINUTE_MS
  }

  /** Gaps a session of at least `minMs` could use, with their day. */
  sessionGaps(minMs: number): (Interval & { day?: number })[] {
    return this.pieces().filter((p) => this.budgetLeftMs(p.day) >= minMs)
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

interface Unit extends Interval {
  day?: number
  /** Most of the unit one session may take: its length, capped by its day's budget left. */
  capMs: number
}

/** Search steps one task's split may take, so a hopeless week stays fast. */
const MAX_SPLIT_STEPS = 20_000

/**
 * The fewest sessions (then the earliest) that add up to the task's
 * duration, or undefined. See `SplitOptions`. Depth-first over free gaps in
 * time order: for a given number of sessions the first set found is the one
 * whose gaps are earliest. Each session takes as much of its gap as it can,
 * leaving at least the minimum for each one after it, so earlier days fill
 * first.
 */
function splitSessions(
  w: Window,
  avail: Availability,
  alignMs: number,
  split: SplitOptions,
): Interval[] | undefined {
  const minMs = split.minSessionMin * MINUTE_MS
  if (w.durMs < 2 * minMs) return undefined
  const units: Unit[] = []
  for (const p of avail.sessionGaps(minMs)) {
    const start = Math.ceil(Math.max(p.start, w.lo) / alignMs) * alignMs
    const end = Math.min(p.end, w.hi)
    const capMs = Math.min(end - start, avail.budgetLeftMs(p.day))
    if (Number.isFinite(start) && capMs >= minMs) units.push({ start, end, day: p.day, capMs })
  }
  // Upper bound on what units i.. can hold, for pruning.
  const suffix = new Array<number>(units.length + 1).fill(0)
  for (let i = units.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + units[i].capMs
  if (suffix[0] < w.durMs) return undefined

  // No fewer sessions than the largest units could hold.
  const caps = units.map((u) => u.capMs).sort((a, b) => b - a)
  let fewest = 0
  for (let sum = 0; sum < w.durMs; fewest++) sum += caps[fewest]
  const most = Math.min(split.maxSessions ?? DEFAULT_MAX_SESSIONS, units.length)

  let steps = 0
  const dayUsed = new Map<number, number>()
  const used = (day: number | undefined) => (day === undefined ? 0 : dayUsed.get(day) ?? 0)
  const search = (from: number, count: number, remaining: number, prevEnd: number): Interval[] | undefined => {
    for (let i = from; i <= units.length - count; i++) {
      if (++steps > MAX_SPLIT_STEPS || suffix[i] < remaining) return undefined
      const u = units[i]
      // Touching pieces (cut at midnight) would run two sessions back to back.
      if (u.start <= prevEnd) continue
      const room = Math.min(u.capMs, avail.budgetLeftMs(u.day) - used(u.day))
      const after = count - 1
      if (after === 0) {
        if (remaining <= room) return [{ start: u.start, end: u.start + remaining }]
        continue
      }
      const take = Math.floor(Math.min(room, remaining - after * minMs) / alignMs) * alignMs
      if (take < minMs) continue
      const end = u.start + take
      if (u.day !== undefined) dayUsed.set(u.day, used(u.day) + take)
      const rest = search(i + 1, after, remaining - take, end)
      if (u.day !== undefined) dayUsed.set(u.day, used(u.day) - take)
      if (rest) return [{ start: u.start, end }, ...rest]
    }
    return undefined
  }
  for (let count = Math.max(2, fewest); count <= most; count++) {
    const found = search(0, count, w.durMs, -Infinity)
    if (found || steps > MAX_SPLIT_STEPS) return found
  }
  return undefined
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
 * default (latest-fit with `anchor: 'latest'`). With `split`, a task that
 * fits in no single block is placed as a few sessions instead.
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
    const tooLong = overBudget(task, opts.dailyBudget)
    if (tooLong && !opts.split) {
      unplaced.push({ taskId: task.id, reason: 'over-daily-budget' })
      continue
    }
    let start: number | undefined
    if (!tooLong) {
      for (const slot of byAnchor(avail.gaps(w.durMs), anchor)) {
        start = fitIn(slot, w, alignMs, anchor)
        if (start !== undefined) break
      }
    }
    const blocks = start !== undefined
      ? [{ start, end: start + w.durMs }]
      : opts.split && splitSessions(w, avail, alignMs, opts.split)
    if (!blocks) {
      unplaced.push({ taskId: task.id, reason: 'no-free-slot' })
      continue
    }
    for (const b of blocks) {
      const block = { taskId: task.id, start: b.start, end: b.end }
      placements.push(block)
      avail.take(block)
    }
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
  opts: Omit<PlaceOptions, 'policy' | 'split'>,
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
