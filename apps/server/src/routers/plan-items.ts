import type { TransactionSql } from 'postgres'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import {
  planItemUpdateInput,
  planItemListInput,
  newPlanItemInput,
  planItemIdInput as id,
} from '@pls/substrate'
import type { PlanItem, PlanItemQuery } from '@pls/substrate'
import { dispatchWorkflows } from '../workflows/dispatch'
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
 * The one event rule, whichever procedure made the change: every change fires
 * plan-item:updated, and a transition into 'done' also fires
 * plan-item:completed (exactly once per transition).
 */
async function dispatchChange(tx: TransactionSql, userId: string, before: PlanItem, after: PlanItem) {
  await dispatchWorkflows(tx, userId, 'plan-item:updated', eventPayload(after), null)
  if (before.status !== 'done' && after.status === 'done') {
    await dispatchWorkflows(tx, userId, 'plan-item:completed', eventPayload(after), null)
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
    .input(newPlanItemInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const item = await insertPlanItem(tx, ctx.userId, input)
        await dispatchWorkflows(tx, ctx.userId, 'plan-item:created', eventPayload(item), null)
        return item
      })
    }),

  /**
   * Patch the stored item (for a recurring item: the whole series). Send only
   * the fields that change; `null` clears one. See PlanItemOccurrence for
   * editing from a list row.
   */
  update: publicProcedure
    .input(planItemUpdateInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const current = await fetchOne(tx, ctx.userId, input.id)
        const { course, ...patch } = input.patch
        const merged: Stored = { ...current, ...patch }
        assertValid(merged)
        await tx`
          UPDATE plan_items SET ${tx({ ...columns(tx, merged), updated_at: new Date() })}
          WHERE id = ${input.id} AND user_id = ${ctx.userId}
        `
        if (course !== undefined) await setCourse(tx, ctx.userId, input.id, course)
        const item = await fetchOne(tx, ctx.userId, input.id)
        await dispatchChange(tx, ctx.userId, current, item)
        return item
      })
    }),

  complete: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const { before, item } = await setStatus(tx, ctx.userId, input, 'done')
        if (before.status !== item.status) await dispatchChange(tx, ctx.userId, before, item)
        return item
      })
    }),

  dismiss: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const { before, item } = await setStatus(tx, ctx.userId, input, 'dismissed')
        if (before.status !== item.status) await dispatchChange(tx, ctx.userId, before, item)
        return item
      })
    }),

  /** Hard delete (no workflow event). NOT_FOUND for a missing or another user's id. */
  delete: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const rows = await tx`DELETE FROM plan_items WHERE id = ${input} AND user_id = ${ctx.userId} RETURNING id`
        if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan item not found' })
        await setCourse(tx, ctx.userId, input, null)
      })
    }),
})
