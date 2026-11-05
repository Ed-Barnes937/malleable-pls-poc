import type { TransactionSql } from 'postgres'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import {
  planItemUpdateOnBoardInput,
  planItemListInput,
  newPlanItemOnBoardInput,
  planItemOnBoardInput,
  planItemIdInput as id,
  refitAcceptInput,
  refitPreviewInput,
  CLOSED_WITH_TODO,
  SESSION_SOURCE_TYPE,
  isSession,
  newSession,
  sessionParentId,
} from '@pls/substrate'
import type { PlanItem, PlanItemQuery } from '@pls/substrate'
import { dispatchWorkflows } from '../workflows/dispatch'
import { studentTimeZone } from '../preferences/store'
import { acceptRefit, previewRefit } from '../planning/refit'
import {
  assertValid,
  columns,
  courseColumn,
  eventPayload,
  fetchOne,
  insertPlanItem,
  listPlanItems,
  setCourse,
  toPlanItem,
  type Stored,
} from '../plan-items/store'

/** Sets the status; returns the item before and after (unchanged if already at `next`). */
async function setStatus(tx: TransactionSql, userId: string, planItemId: string, next: PlanItem['status']) {
  const before = await fetchOne(tx, userId, planItemId)
  if (before.status === next) return { before, item: before }
  await tx`
    UPDATE plan_items SET status = ${next}, updated_at = now()
    WHERE id = ${planItemId} AND user_id = ${userId}
  `
  return { before, item: await fetchOne(tx, userId, planItemId) }
}

/**
 * A to-do booked in sessions is ticked off (or dismissed) once: its sessions
 * follow (see @pls/substrate sessions).
 * - Done or dismissed closes its open sessions, marked `CLOSED_WITH_TODO`.
 * - Reopening it reopens just those, and only the ones still ahead (a past
 *   one would come back as "didn't happen"); one the student ticked on its
 *   own stays ticked.
 * - A new title, course (`course`, as patched) or due time carries over.
 * - A session whose own status changes loses the mark: that is the
 *   student's choice now.
 * Cascaded changes fire no workflow events.
 */
async function cascadeToSessions(tx: TransactionSql, userId: string, before: PlanItem, after: PlanItem, course?: string | null) {
  if (after.kind !== 'task') return
  if (isSession(after)) {
    if (before.status !== after.status && after.subtype === CLOSED_WITH_TODO) {
      await tx`UPDATE plan_items SET subtype = NULL WHERE id = ${after.id} AND user_id = ${userId}`
    }
    return
  }
  const owned = tx`user_id = ${userId} AND kind = 'task' AND source_type = ${SESSION_SOURCE_TYPE} AND source_id = ${after.id}`
  if (before.title !== after.title) await tx`UPDATE plan_items SET title = ${after.title}, updated_at = now() WHERE ${owned}`
  if (before.due_at !== after.due_at) await tx`UPDATE plan_items SET due_at = ${after.due_at}, updated_at = now() WHERE ${owned}`
  if (course !== undefined) {
    for (const s of await tx`SELECT id FROM plan_items WHERE ${owned}`) await setCourse(tx, userId, s.id as string, course)
  }
  if (before.status === after.status) return
  if (after.status === 'open') {
    await tx`
      UPDATE plan_items SET status = CASE WHEN ends_at > now() THEN 'open' ELSE status END, subtype = NULL, updated_at = now()
      WHERE ${owned} AND subtype = ${CLOSED_WITH_TODO}
    `
  } else {
    await tx`
      UPDATE plan_items SET status = ${after.status}, subtype = ${CLOSED_WITH_TODO}, updated_at = now()
      WHERE ${owned} AND status = 'open'
    `
  }
}

/**
 * A to-do booked in one block becomes sessions when a second booking is
 * needed (see @pls/substrate sessions): before `session` is added, the
 * to-do's own block moves into a session of its own, at the same time and
 * status, and the to-do keeps only its total. Fires no workflow events (the
 * student's time hasn't changed).
 */
async function ownBlockToSession(tx: TransactionSql, userId: string, session: { kind: PlanItem['kind']; source_type?: string | null; source_id?: string | null }) {
  const parentId = sessionParentId({ kind: session.kind, source_type: session.source_type ?? null, source_id: session.source_id ?? null })
  if (!parentId) return
  const todo = await fetchOne(tx, userId, parentId)
  if (todo.kind !== 'task' || isSession(todo) || todo.recurrence || !todo.starts_at || !todo.ends_at) return
  const moved = await insertPlanItem(tx, userId, newSession(todo, todo.starts_at, todo.ends_at), todo.time_zone)
  if (todo.status !== 'open') {
    await tx`UPDATE plan_items SET status = ${todo.status} WHERE id = ${moved.id} AND user_id = ${userId}`
  }
  await tx`
    UPDATE plan_items SET starts_at = NULL, ends_at = NULL, updated_at = now()
    WHERE id = ${todo.id} AND user_id = ${userId}
  `
}

/**
 * The one event rule, whichever procedure made the change: every change fires
 * plan-item:updated, and a transition into 'done' also fires
 * plan-item:completed (exactly once per transition).
 */
async function dispatchChange(
  tx: TransactionSql,
  userId: string,
  before: PlanItem,
  after: PlanItem,
  workspaceId: string | null,
) {
  await dispatchWorkflows(tx, userId, 'plan-item:updated', eventPayload(after), workspaceId)
  if (before.status !== 'done' && after.status === 'done') {
    await dispatchWorkflows(tx, userId, 'plan-item:completed', eventPayload(after), workspaceId)
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const planItemsRouter = router({
  /**
   * Plan items matching the filters. With `from`/`to`, weekly recurrences are
   * expanded into one row per occurrence in [from, to) and undated items are
   * left out; without a range every matching item is returned once, as stored.
   * `scheduled` narrows to items with (true) or without (false) a time block.
   */
  list: publicProcedure
    .input(planItemListInput)
    .query(async ({ ctx, input }) => {
      const query: PlanItemQuery = input ?? {}
      return withUser(ctx.userId, (tx) => listPlanItems(tx, ctx.userId, query))
    }),

  byId: publicProcedure
    .input(id)
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [row] = await tx`
          SELECT p.*, ${courseColumn(tx)} FROM plan_items p
          WHERE p.id = ${input} AND p.user_id = ${ctx.userId}
        `
        return row ? toPlanItem(row) : null
      })
    }),

  create: publicProcedure
    .input(newPlanItemOnBoardInput)
    .mutation(async ({ ctx, input: { workspaceId, timeZone, ...input } }) => {
      return withUser(ctx.userId, async (tx) => {
        await ownBlockToSession(tx, ctx.userId, input)
        const item = await insertPlanItem(tx, ctx.userId, input, timeZone)
        await dispatchWorkflows(tx, ctx.userId, 'plan-item:created', eventPayload(item), workspaceId ?? null)
        return item
      })
    }),

  /**
   * Patch the stored item (for a recurring item: the whole series). Send only
   * the fields that change; `null` clears one. See PlanItemOccurrence for
   * editing from a list row.
   */
  update: publicProcedure
    .input(planItemUpdateOnBoardInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const current = await fetchOne(tx, ctx.userId, input.id)
        const { course, ...patch } = input.patch
        const merged: Stored = { ...current, ...patch }
        assertValid(merged)
        // An item from before items kept their zone takes the student's now;
        // one that has a zone keeps it (see PlanItem.time_zone).
        const timeZone = current.time_zone ?? await studentTimeZone(tx, ctx.userId, input.timeZone)
        await tx`
          UPDATE plan_items SET ${tx({ ...columns(tx, merged), time_zone: timeZone, updated_at: new Date() })}
          WHERE id = ${input.id} AND user_id = ${ctx.userId}
        `
        if (course !== undefined) await setCourse(tx, ctx.userId, input.id, course)
        const item = await fetchOne(tx, ctx.userId, input.id)
        await cascadeToSessions(tx, ctx.userId, current, item, course)
        await dispatchChange(tx, ctx.userId, current, item, input.workspaceId ?? null)
        return item
      })
    }),

  complete: publicProcedure
    .input(planItemOnBoardInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const { before, item } = await setStatus(tx, ctx.userId, input.id, 'done')
        await cascadeToSessions(tx, ctx.userId, before, item)
        if (before.status !== item.status) await dispatchChange(tx, ctx.userId, before, item, input.workspaceId)
        return item
      })
    }),

  dismiss: publicProcedure
    .input(planItemOnBoardInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const { before, item } = await setStatus(tx, ctx.userId, input.id, 'dismissed')
        await cascadeToSessions(tx, ctx.userId, before, item)
        if (before.status !== item.status) await dispatchChange(tx, ctx.userId, before, item, input.workspaceId)
        return item
      })
    }),

  /**
   * To-dos whose time block ended without being done ("2 blocks didn't
   * happen"), each with where re-fit would put it now, or why it doesn't fit.
   * Empty when nothing was missed. Never includes commitments.
   */
  refitPreview: publicProcedure
    .input(refitPreviewInput)
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, (tx) => previewRefit(tx, ctx.userId, { now: Date.now(), timeZone: input.timeZone }))
    }),

  /**
   * Accept re-fit blocks as previewed. CONFLICT (nothing written) when the
   * week changed since the preview; fetch a fresh one.
   */
  refit: publicProcedure
    .input(refitAcceptInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, (tx) => acceptRefit(tx, ctx.userId, {
        now: Date.now(),
        timeZone: input.timeZone,
        blocks: input.blocks,
        workspaceId: input.workspaceId ?? null,
      }))
    }),

  /**
   * Hard delete (no workflow event), with the to-do's sessions if it has
   * any. NOT_FOUND for a missing or another user's id.
   */
  delete: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const rows = await tx`DELETE FROM plan_items WHERE id = ${input} AND user_id = ${ctx.userId} RETURNING id`
        if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan item not found' })
        await setCourse(tx, ctx.userId, input, null)
        const sessions = await tx`
          DELETE FROM plan_items
          WHERE user_id = ${ctx.userId} AND kind = 'task' AND source_type = ${SESSION_SOURCE_TYPE} AND source_id = ${input}
          RETURNING id
        `
        for (const s of sessions) await setCourse(tx, ctx.userId, s.id as string, null)
      })
    }),
})
