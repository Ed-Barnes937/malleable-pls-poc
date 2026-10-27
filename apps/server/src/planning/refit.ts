import type { TransactionSql } from 'postgres'
import { TRPCError } from '@trpc/server'
import {
  busyTime,
  isMissedBlock,
  planRefit,
  refitConflict,
  refitRange,
  type PlanItem,
  type PlanItemOccurrence,
  type RefitPreview,
  type RefitResult,
} from '@pls/substrate'
import { dispatchWorkflows } from '../workflows/dispatch'
import { eventPayload, fetchOne, listPlanItems } from '../plan-items/store'

// Re-fit: to-dos whose time block ended without being done get new blocks in
// free time, around every commitment (never moved) and every other block.
// The rules are in packages/substrate/src/planning.ts; this loads the data and
// writes the result.

/** Open one-off to-dos whose block has ended (any course: scope never applies to placement). */
async function loadMissed(tx: TransactionSql, userId: string, now: number): Promise<PlanItem[]> {
  const scheduled = await listPlanItems(tx, userId, { kinds: ['task'], statuses: ['open'], scheduled: true })
  return scheduled.filter((item) => isMissedBlock(item, now))
}

async function loadRange(tx: TransactionSql, userId: string, missed: PlanItem[], opts: { now: number; timeZone: string }): Promise<PlanItemOccurrence[]> {
  const range = refitRange(missed, opts)
  return listPlanItems(tx, userId, {
    from: new Date(range.start).toISOString(),
    to: new Date(range.end).toISOString(),
    statuses: ['open', 'done'],
  })
}

/** The blocks that didn't happen, and where they would go now. Read-only. */
export async function previewRefit(tx: TransactionSql, userId: string, opts: { now: number; timeZone: string }): Promise<RefitPreview> {
  const missed = await loadMissed(tx, userId, opts.now)
  if (missed.length === 0) return []
  return planRefit(missed, await loadRange(tx, userId, missed, opts), opts)
}

/**
 * Moves the accepted blocks to the times the student saw in the preview.
 * Refuses (CONFLICT, nothing written) if the week changed since: a to-do is no
 * longer a missed block, a new time has already started, or it now overlaps
 * a commitment or another block. The UI then shows a fresh preview.
 */
export async function acceptRefit(
  tx: TransactionSql,
  userId: string,
  args: { now: number; timeZone: string; blocks: { id: string; starts_at: string; ends_at: string }[]; workspaceId: string | null },
): Promise<RefitResult> {
  const { now, blocks } = args
  // Serialise re-fits per user so two tabs can't both write.
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`refit:${userId}`}))`
  const missed = new Map((await loadMissed(tx, userId, now)).map((item) => [item.id, item]))
  const accepted = blocks.map((b) => {
    const item = missed.get(b.id)
    if (!item) throw conflict('A block was already moved, done or removed.')
    return { item, start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) }
  })
  if (new Set(accepted.map((a) => a.item.id)).size !== accepted.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Each block can be re-fit once.' })
  }
  for (const a of accepted) {
    if (!(a.end > a.start)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A block must end after it starts.' })
  }

  const items = await loadRange(tx, userId, [...missed.values()], args)
  const { commitments, busy } = busyTime(items, new Set(accepted.map((a) => a.item.id)))
  const taken = [...commitments, ...busy]
  for (const a of accepted) {
    const block = { start: a.start, end: a.end }
    if (refitConflict(block, taken, now)) throw conflict('Your week changed since this re-fit was suggested.')
    taken.push(block)
  }

  for (const a of accepted) {
    await tx`
      UPDATE plan_items SET
        starts_at = ${new Date(a.start).toISOString()},
        ends_at = ${new Date(a.end).toISOString()},
        updated_at = now()
      WHERE id = ${a.item.id} AND user_id = ${userId}
    `
    const after = await fetchOne(tx, userId, a.item.id)
    await dispatchWorkflows(tx, userId, 'plan-item:updated', eventPayload(after), args.workspaceId)
  }
  return { moved: accepted.length }
}

function conflict(message: string): TRPCError {
  return new TRPCError({ code: 'CONFLICT', message })
}
