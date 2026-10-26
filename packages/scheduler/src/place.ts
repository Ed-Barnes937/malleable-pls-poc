import { MINUTE_MS, subtract, type Interval } from './intervals'

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

/** Free time minus blocks that stay put (those not belonging to `movingIds`). */
function available(
  free: ReadonlyArray<Interval>,
  existing: ReadonlyArray<ExistingPlacement>,
  movingIds: ReadonlySet<string>,
): Interval[] {
  const fixed = existing.filter((e) => e.taskId === undefined || !movingIds.has(e.taskId))
  return subtract(free, fixed)
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
  let avail = available(freeSlots, opts.existingPlacements ?? [], moving)
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
    let start: number | undefined
    for (const slot of byAnchor(avail, anchor)) {
      start = fitIn(slot, w, alignMs, anchor)
      if (start !== undefined) break
    }
    if (start === undefined) {
      unplaced.push({ taskId: task.id, reason: 'no-free-slot' })
      continue
    }
    const block = { taskId: task.id, start, end: start + w.durMs }
    placements.push(block)
    avail = subtract(avail, [block])
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
  if (typeof w === 'string') return out
  const anchor = opts.anchor ?? 'earliest'
  const avail = available(freeSlots, opts.existingPlacements ?? [], new Set([task.id]))
  for (const slot of byAnchor(avail, anchor)) {
    if (out.length >= n) break
    const start = fitIn(slot, w, alignMs, anchor)
    if (start !== undefined) out.push({ taskId: task.id, start, end: start + w.durMs })
  }
  return out
}

/** A scheduled block whose time may have passed without the task being done. */
export interface MissedBlock extends Placement {
  /** Defaults to the block's own length. */
  durationMin?: number
  /** Carried over from the task, e.g. its due date. */
  latest?: number
}

export interface RefitResult extends PlaceResult {
  /**
   * Blocks that have not ended yet at `now` (upcoming or in progress): left
   * where they are and treated as busy, so nothing is re-fit on top of them.
   */
  notMissed: string[]
}

/**
 * Re-place blocks whose time passed (`end <= now`) without completion. The
 * caller decides which blocks were not completed; this only moves those that
 * are actually in the past, to free time from `now` that fits their duration
 * and deadline (earliest-fit unless `anchor` says otherwise). Blocks that
 * have not ended stay put and are busy. With the default `'priority'` policy
 * the oldest missed block gets first pick.
 */
export function refit(
  blocks: ReadonlyArray<MissedBlock>,
  freeSlots: ReadonlyArray<Interval>,
  opts: PlaceOptions,
): RefitResult {
  const missed = blocks.filter((b) => b.end <= opts.now)
  const upcoming = blocks.filter((b) => b.end > opts.now)
  // Passed without a taskId so they stay fixed even if a missed block shares it.
  const busy = upcoming.map((b) => ({ start: b.start, end: b.end }))
  const tasks: SchedulerTask[] = [...missed]
    .sort((a, b) => a.start - b.start)
    .map((b) => ({
      id: b.taskId,
      durationMin: b.durationMin ?? (b.end - b.start) / MINUTE_MS,
      latest: b.latest,
    }))
  const existingPlacements = [...(opts.existingPlacements ?? []), ...busy]
  return {
    ...place(tasks, freeSlots, { ...opts, existingPlacements }),
    notMissed: upcoming.map((b) => b.taskId),
  }
}
