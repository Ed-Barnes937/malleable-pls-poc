import type { JSONValue, TransactionSql } from 'postgres'
import { startOfLocalDay, type Interval } from '@pls/scheduler'
import {
  REVIEW_SUBTYPE,
  REVIEW_TASK_JOB,
  placeReviews,
  type PlanItem,
  type ReviewSlot,
  type ReviewTaskParams,
  type ReviewToPlace,
} from '@pls/substrate'
import { dispatchWorkflows } from '../workflows/dispatch'
import { eventPayload, fetchOne, insertPlanItem, listPlanItems } from '../plan-items/store'

// The confusion automation's server side: where a review goes in time
// ("AI suggests, code decides": the LLM only names it), and moving the
// reviews it made when the student edits its params.
//
// Movable rule: only open, not-yet-started reviews this automation created
// and placed, still where it put them. Commitments never move; every other
// block (accepted, dragged by hand, made by anything else) is fixed and busy.

// Placement (`placeReviews` in @pls/substrate's planning module, shared with
// Help me plan's study day, gap and budget): the earliest free time in the
// review's window, at least an hour after the mark, from 09:00, on a day with
// study time left.

const MINUTE_MS = 60_000

/** The review must end by this instant: the end of the local day `windowDays` after it was marked. */
export function reviewDeadline(markedAt: number, params: Pick<ReviewTaskParams, 'windowDays' | 'timeZone'>): number {
  return startOfLocalDay(markedAt, params.timeZone, params.windowDays + 1)
}

/** Stored as the to-do's due time so lists can say "by Thu": 23:59 local on the last day. */
function dueAtFor(deadline: number): string {
  return new Date(deadline - MINUTE_MS).toISOString()
}

export type { ReviewSlot, ReviewToPlace }

/**
 * Finds a slot for each review, earliest-first inside its window, around
 * every commitment of every course and every other scheduled task. Earlier
 * entries get first pick. Read-only.
 */
export async function findReviewSlots(
  tx: TransactionSql,
  userId: string,
  reviews: ReviewToPlace[],
  opts: { now: number; timeZone: string },
): Promise<Map<string, ReviewSlot>> {
  if (reviews.length === 0) return new Map()
  const horizon = Math.max(...reviews.map((r) => r.latest))
  if (horizon <= opts.now) return new Map(reviews.map((r) => [r.id, { reason: 'window-closed' as const }]))

  const range: Interval = { start: startOfLocalDay(opts.now, opts.timeZone), end: horizon }
  // Scope never applies here: a Biology review still avoids Chemistry and shifts.
  const items = await listPlanItems(tx, userId, {
    from: new Date(range.start).toISOString(),
    to: new Date(range.end).toISOString(),
    statuses: ['open', 'done'],
  })
  // The daily budget is the default (2h): the board's Calendar setting is
  // panel config the server can't see. Moves to a user preference with S1.
  return placeReviews(items, reviews, range, opts)
}

/** The fields a placement result writes on the review. */
function placementColumns(slot: ReviewSlot | undefined) {
  if (slot && 'start' in slot) {
    return { starts_at: new Date(slot.start).toISOString(), ends_at: new Date(slot.end).toISOString() }
  }
  return { starts_at: null, ends_at: null }
}

// ---------------------------------------------------------------------------
// Creating a review for a marked moment
// ---------------------------------------------------------------------------

export interface MarkedMoment {
  segmentId: string
  recordingId: string
  recordingTitle: string
  startMs: number
  text: string
  before: string
  after: string
  course: string | null
}

/** The marked transcript moment with its neighbours, or null if it is gone. */
export async function loadMoment(tx: TransactionSql, segmentId: string): Promise<MarkedMoment | null> {
  const [seg] = await tx`
    SELECT ts.id, ts.recording_id, ts.start_ms, ts.text, r.title,
      (SELECT t.label FROM tags t
        WHERE t.target_type = 'recording' AND t.target_id = ts.recording_id
        ORDER BY t.created_at, t.id LIMIT 1) AS course
    FROM transcript_segments ts
    JOIN recordings r ON r.id = ts.recording_id
    WHERE ts.id = ${segmentId}
  `
  if (!seg) return null
  const neighbours = await tx`
    (SELECT 'before' AS side, text FROM transcript_segments
      WHERE recording_id = ${seg.recording_id} AND start_ms < ${seg.start_ms}
      ORDER BY start_ms DESC LIMIT 1)
    UNION ALL
    (SELECT 'after' AS side, text FROM transcript_segments
      WHERE recording_id = ${seg.recording_id} AND start_ms > ${seg.start_ms}
      ORDER BY start_ms ASC LIMIT 1)
  `
  const side = (s: string) => (neighbours.find((n) => n.side === s)?.text as string | undefined) ?? ''
  return {
    segmentId: seg.id as string,
    recordingId: seg.recording_id as string,
    recordingTitle: seg.title as string,
    startMs: seg.start_ms as number,
    text: seg.text as string,
    before: side('before'),
    after: side('after'),
    course: (seg.course as string | null) ?? null,
  }
}

/** An open review already made for this moment, so marking it twice adds one to-do, not two. */
export async function findOpenReview(tx: TransactionSql, userId: string, moment: MarkedMoment): Promise<PlanItem | null> {
  const [row] = await tx`
    SELECT id FROM plan_items
    WHERE user_id = ${userId} AND kind = 'task' AND status = 'open' AND subtype = ${REVIEW_SUBTYPE}
      AND source_type = 'recording' AND source_id = ${moment.recordingId} AND source_offset_ms = ${moment.startMs}
    ORDER BY created_at LIMIT 1
  `
  return row ? fetchOne(tx, userId, row.id as string) : null
}

/**
 * Adds the review to-do for a marked moment, linked to it (recording +
 * offset) and filed under the lecture's course, and places it. If no slot
 * fits it stays unscheduled (still on the to-do list, never dropped).
 */
export async function createReview(
  tx: TransactionSql,
  userId: string,
  args: { moment: MarkedMoment; title: string; params: ReviewTaskParams; now: number },
): Promise<{ item: PlanItem; slot: ReviewSlot | undefined; created: true } | { item: PlanItem; created: false }> {
  const { moment, params, now } = args
  // One review per moment even when two marks race: serialise on the moment,
  // then check again inside this transaction.
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`review:${userId}:${moment.recordingId}:${moment.startMs}`}))`
  const existing = await findOpenReview(tx, userId, moment)
  if (existing) return { item: existing, created: false }

  const deadline = reviewDeadline(now, params)
  const created = await insertPlanItem(tx, userId, {
    kind: 'task',
    title: args.title,
    duration_min: params.durationMin,
    due_at: dueAtFor(deadline),
    subtype: REVIEW_SUBTYPE,
    source_type: 'recording',
    source_id: moment.recordingId,
    source_offset_ms: moment.startMs,
    course: moment.course,
  })
  const slots = await findReviewSlots(
    tx,
    userId,
    [{ id: created.id, durationMin: params.durationMin, markedAt: now, latest: deadline }],
    { now, timeZone: params.timeZone },
  )
  const slot = slots.get(created.id)
  const placed = placementColumns(slot)
  if (placed.starts_at) {
    await tx`
      UPDATE plan_items SET starts_at = ${placed.starts_at}, ends_at = ${placed.ends_at}
      WHERE id = ${created.id} AND user_id = ${userId}
    `
  }
  return { item: await fetchOne(tx, userId, created.id), slot, created: true }
}

// ---------------------------------------------------------------------------
// Re-placing after the student edits the automation
// ---------------------------------------------------------------------------

export interface ReplaceResult {
  /** Reviews now at a different time (or newly on the calendar). */
  moved: number
  /** Reviews that kept their start and only changed length. */
  resized: number
  /** Reviews that no longer fit their window and are now unscheduled. */
  unscheduled: number
}

/**
 * Applies new params to the open, not-yet-started reviews `workflowId` made,
 * and places them again. The job runs are the record of what it made and
 * where it put them (`output.plan_item_id` / `output.starts_at`); a review the
 * student has since moved, started, finished or dismissed is left alone.
 */
export async function replaceAutomationReviews(
  tx: TransactionSql,
  userId: string,
  args: { workflowId: string; params: ReviewTaskParams; now: number },
): Promise<ReplaceResult> {
  const { workflowId, params, now } = args
  const runs = await tx`
    SELECT output FROM job_runs
    WHERE user_id = ${userId} AND workflow_id = ${workflowId} AND job_type = ${REVIEW_TASK_JOB}
      AND status = 'completed' AND output ? 'plan_item_id' AND NOT (output ? 'deduplicated')
    ORDER BY created_at, id
  `
  // The run that created a review is the only record of where the automation
  // put it; a review is made by one run, so the first one wins.
  const placedAt = new Map<string, string | null>()
  for (const { output } of runs) {
    const id = output.plan_item_id as string
    if (!placedAt.has(id)) placedAt.set(id, (output.starts_at as string | null | undefined) ?? null)
  }
  if (placedAt.size === 0) return { moved: 0, resized: 0, unscheduled: 0 }

  const rows = await tx`
    SELECT id FROM plan_items
    WHERE user_id = ${userId} AND id IN ${tx([...placedAt.keys()])}
      AND kind = 'task' AND status = 'open' AND subtype = ${REVIEW_SUBTYPE}
      AND (starts_at IS NULL OR starts_at > ${new Date(now).toISOString()})
    ORDER BY created_at, id
  `
  const movable: PlanItem[] = []
  for (const { id } of rows) {
    const item = await fetchOne(tx, userId, id as string)
    const autoPlaced = placedAt.get(item.id) ?? null
    if (sameInstant(item.starts_at, autoPlaced)) movable.push(item)
  }
  if (movable.length === 0) return { moved: 0, resized: 0, unscheduled: 0 }

  const deadlines = new Map(movable.map((item) => [item.id, reviewDeadline(Date.parse(item.created_at), params)]))
  const slots = await findReviewSlots(
    tx,
    userId,
    movable.map((item) => ({
      id: item.id,
      durationMin: params.durationMin,
      markedAt: Date.parse(item.created_at),
      latest: deadlines.get(item.id)!,
    })),
    { now, timeZone: params.timeZone },
  )

  const result: ReplaceResult = { moved: 0, resized: 0, unscheduled: 0 }
  for (const before of movable) {
    const placed = placementColumns(slots.get(before.id))
    await tx`
      UPDATE plan_items SET
        duration_min = ${params.durationMin},
        due_at = ${dueAtFor(deadlines.get(before.id)!)},
        starts_at = ${placed.starts_at},
        ends_at = ${placed.ends_at},
        updated_at = now()
      WHERE id = ${before.id} AND user_id = ${userId}
    `
    await tx`
      UPDATE job_runs SET output = output || ${tx.json(placed as JSONValue)}
      WHERE user_id = ${userId} AND workflow_id = ${workflowId} AND job_type = ${REVIEW_TASK_JOB}
        AND output->>'plan_item_id' = ${before.id} AND NOT (output ? 'deduplicated')
    `
    const after = await fetchOne(tx, userId, before.id)
    if (before.starts_at && !after.starts_at) result.unscheduled++
    else if (!sameInstant(before.starts_at, after.starts_at)) result.moved++
    else if (before.duration_min !== after.duration_min) result.resized++
    await dispatchWorkflows(tx, userId, 'plan-item:updated', eventPayload(after), null)
  }
  return result
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return Date.parse(a) === Date.parse(b)
}
