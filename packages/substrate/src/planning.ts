// Where study time can go, shared by everything that places blocks (the
// confusion automation, re-fit) and by the backend simulator, so they agree.
// "AI suggests, code decides": all of this is deterministic. Commitments are
// never moved.
import {
  freeSlots,
  refit,
  startOfLocalDay,
  MINUTE_MS,
  type ExistingPlacement,
  type Interval,
  type UnplacedReason,
} from '@pls/scheduler'
import { REVIEW_SUBTYPE } from './workflows/review-automation'
import type { PlanItem, PlanItemOccurrence } from './types'

/** The study day blocks are placed in, with breathing room around classes and shifts. */
export const STUDY_DAY = { dayStart: '08:00', dayEnd: '22:00', bufferMin: 10 } as const

/**
 * The calendar's fixed time, from the items of a range (`listPlanItems` with
 * `from`/`to`, so weekly classes are expanded): every commitment of every
 * course, plus every other time block (open or done to-dos, accepted study
 * time), which is busy but is not a commitment. Items in `moving` are the
 * ones being placed, so their current blocks don't count.
 */
export function busyTime(
  items: ReadonlyArray<PlanItemOccurrence>,
  moving: ReadonlySet<string>,
): { commitments: Interval[]; busy: ExistingPlacement[] } {
  const commitments: Interval[] = []
  const busy: ExistingPlacement[] = []
  for (const item of items) {
    if (!item.starts_at || !item.ends_at || moving.has(item.id)) continue
    if (item.status === 'dismissed') continue
    const block = { start: Date.parse(item.starts_at), end: Date.parse(item.ends_at) }
    if (item.kind === 'commitment') commitments.push(block)
    // Reviews keep a gap between them so two never run back to back.
    else if (item.kind === 'task') busy.push({ ...(item.subtype === REVIEW_SUBTYPE ? padded(block) : block), taskId: item.id })
  }
  return { commitments, busy }
}

/** A review's block with the study-day buffer either side. */
export function padded(block: Interval): Interval {
  const pad = STUDY_DAY.bufferMin * MINUTE_MS
  return { start: block.start - pad, end: block.end + pad }
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
 * New times for the missed blocks, oldest first, earliest free fit from now,
 * around every commitment and every other block in `items` (the range from
 * `refitRange`, expanded). A to-do still due later must fit before it is due;
 * one whose due date has passed just goes in the next free time. Read-only.
 */
export function planRefit(
  missed: ReadonlyArray<PlanItem>,
  items: ReadonlyArray<PlanItemOccurrence>,
  opts: { now: number; timeZone: string },
): RefitProposal[] {
  if (missed.length === 0) return []
  const range = refitRange(missed, opts)
  const { commitments, busy } = busyTime(items, new Set(missed.map((m) => m.id)))
  const free = freeSlots(commitments, range, { timeZone: opts.timeZone, ...STUDY_DAY })
  const result = refit(
    missed.map((item) => ({
      taskId: item.id,
      start: Date.parse(item.starts_at!),
      end: Date.parse(item.ends_at!),
      durationMin: item.duration_min ?? undefined,
      latest: latestFor(item, opts.now),
    })),
    free,
    { now: opts.now, existingPlacements: busy },
  )
  const placed = new Map(result.placements.map((p) => [p.taskId, p]))
  const unplaced = new Map(result.unplaced.map((u) => [u.taskId, u.reason]))
  return [...missed]
    .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!) || a.id.localeCompare(b.id))
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
