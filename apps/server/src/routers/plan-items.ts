import type { TransactionSql } from 'postgres'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import {
  planItemUpdateOnBoardInput,
  planItemListInput,
  newPlanItemOnBoardInput,
  planItemOnBoardInput,
  bookSessionsInput,
  planItemsRevertInput,
  planItemIdInput as id,
  refitAcceptInput,
  refitPreviewInput,
  CLOSED_WITH_TODO,
  SESSION_SOURCE_TYPE,
  bookedMinutes,
  isPlainTodo,
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

/**
 * Moves one item out of plan_items into plan_item_trash, with its course and
 * the lectures linked to it as a class (see migration 024). `parentId`: the
 * item it goes with (a to-do, for its session). False when there is no such
 * item.
 */
async function trash(tx: TransactionSql, userId: string, planItemId: string, parentId: string | null): Promise<boolean> {
  const kept = await tx`
    INSERT INTO plan_item_trash (id, user_id, parent_id, row, course, lecture_ids)
    SELECT p.id, p.user_id, ${parentId}, to_jsonb(p), ${courseColumn(tx)},
      COALESCE((SELECT array_agg(l.id) FROM lectures l WHERE l.user_id = p.user_id AND l.class_item_id = p.id), '{}')
    FROM plan_items p
    WHERE p.id = ${planItemId} AND p.user_id = ${userId}
    ON CONFLICT (id) DO UPDATE SET parent_id = EXCLUDED.parent_id, row = EXCLUDED.row, course = EXCLUDED.course,
      lecture_ids = EXCLUDED.lecture_ids, deleted_at = now()
    RETURNING id
  `
  if (kept.length === 0) return false
  await tx`DELETE FROM plan_items WHERE id = ${planItemId} AND user_id = ${userId}`
  await setCourse(tx, userId, planItemId, null)
  return true
}

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
  // Only a plain to-do: a review's block stays its own, linked to its moment.
  if (!isPlainTodo(todo) || todo.recurrence || !todo.starts_at || !todo.ends_at) return
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
 * A booking lengthened past its to-do's estimate raises the estimate to the
 * booked total (flow-audit decision 16): its own block, or the sum of its
 * sessions. Nothing here lowers it, and a block with no estimate (study time
 * made on the calendar) keeps none. Fires no workflow events.
 */
async function raiseEstimateToBooked(tx: TransactionSql, userId: string, item: PlanItem) {
  if (item.kind !== 'task') return
  const parentId = sessionParentId(item)
  const todo = parentId ? await fetchOne(tx, userId, parentId) : item
  if (todo.duration_min == null || todo.recurrence) return
  const sessions = parentId ? await listPlanItems(tx, userId, { kinds: ['task'], statuses: ['open', 'done'], sourceType: SESSION_SOURCE_TYPE, sourceId: todo.id }) : []
  const booked = Math.round(bookedMinutes([todo, ...sessions]).get(todo.id) ?? 0)
  if (booked <= todo.duration_min) return
  await tx`UPDATE plan_items SET duration_min = ${booked}, updated_at = now() WHERE id = ${todo.id} AND user_id = ${userId}`
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
        await raiseEstimateToBooked(tx, ctx.userId, item)
        await dispatchWorkflows(tx, ctx.userId, 'plan-item:created', eventPayload(item), workspaceId ?? null)
        return item
      })
    }),

  /**
   * Patch the stored item (for a recurring item: the whole series). Send only
   * the fields that change; `null` clears one. See PlanItemOccurrence for
   * editing from a list row.
   */
  /**
   * Book the rest: sessions of one to-do, saved in one transaction (all or
   * none). A to-do still booked in its own block has that block moved into a
   * session first, as `create` does; the estimate rises if the sessions
   * outgrow it. NOT_FOUND for a missing to-do; BAD_REQUEST for anything but
   * an open plain to-do (not a session, not a review of a moment, not done),
   * and for a block that is empty, longer than a day or overlaps another.
   */
  bookSessions: publicProcedure
    .input(bookSessionsInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const todo = await fetchOne(tx, ctx.userId, input.todoId)
        if (!isPlainTodo(todo) || todo.status !== 'open') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only an open to-do of your own can be booked in sessions' })
        }
        const made: PlanItem[] = []
        for (const block of input.blocks) {
          const session = newSession(todo, block.starts_at, block.ends_at)
          await ownBlockToSession(tx, ctx.userId, session)
          const item = await insertPlanItem(tx, ctx.userId, session, input.timeZone)
          await dispatchWorkflows(tx, ctx.userId, 'plan-item:created', eventPayload(item), input.workspaceId ?? null)
          made.push(item)
        }
        await raiseEstimateToBooked(tx, ctx.userId, made[0])
        return made
      })
    }),

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
        const updated = await fetchOne(tx, ctx.userId, input.id)
        await cascadeToSessions(tx, ctx.userId, current, updated, course)
        if (updated.starts_at !== current.starts_at || updated.ends_at !== current.ends_at) await raiseEstimateToBooked(tx, ctx.userId, updated)
        const item = await fetchOne(tx, ctx.userId, input.id)
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
   * Deletes the item (no workflow event), with the to-do's sessions if it
   * has any. A recurring item goes as a whole series. A copy is kept for a
   * day (plan_item_trash), so `restore` can put it back. NOT_FOUND for a
   * missing or another user's id.
   */
  delete: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        await tx`DELETE FROM plan_item_trash WHERE user_id = ${ctx.userId} AND deleted_at < now() - interval '1 day'`
        const sessions = await tx`
          SELECT id FROM plan_items
          WHERE user_id = ${ctx.userId} AND kind = 'task' AND source_type = ${SESSION_SOURCE_TYPE} AND source_id = ${input}
        `
        if (!(await trash(tx, ctx.userId, input, null))) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan item not found' })
        for (const s of sessions) await trash(tx, ctx.userId, s.id as string, input)
      })
    }),

  /**
   * Undo of `delete`: puts the item back exactly as it was (same id, its
   * course, its sessions, the lectures linked to it as a class). Fires no
   * workflow event, as delete fires none. NOT_FOUND when there is nothing
   * to put back (never deleted, already restored, or deleted over a day ago).
   */
  restore: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const rows = await tx`
          SELECT id, course, lecture_ids FROM plan_item_trash
          WHERE user_id = ${ctx.userId} AND (id = ${input} OR parent_id = ${input})
          ORDER BY (id = ${input}) DESC
        `
        if (!rows.some((r) => r.id === input)) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nothing to restore' })
        for (const r of rows) {
          const trashedId = r.id as string
          await tx`
            INSERT INTO plan_items
            SELECT (jsonb_populate_record(NULL::plan_items, t.row)).* FROM plan_item_trash t
            WHERE t.id = ${trashedId} AND t.user_id = ${ctx.userId}
          `
          await setCourse(tx, ctx.userId, trashedId, (r.course as string | null) ?? null)
          const lectures = (r.lecture_ids as string[] | null) ?? []
          if (lectures.length > 0) {
            await tx`
              UPDATE lectures SET class_item_id = ${trashedId}
              WHERE user_id = ${ctx.userId} AND id IN ${tx(lectures)} AND class_item_id IS NULL
            `
          }
          await tx`DELETE FROM plan_item_trash WHERE id = ${trashedId} AND user_id = ${ctx.userId}`
        }
        return fetchOne(tx, ctx.userId, input)
      })
    }),

  /**
   * Undo of `dismiss`: the to-do is open again, and so is every session the
   * dismiss closed with it (`CLOSED_WITH_TODO`), past ones included, as they
   * were. A no-op for an item that isn't dismissed.
   */
  undismiss: publicProcedure
    .input(planItemOnBoardInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const before = await fetchOne(tx, ctx.userId, input.id)
        if (before.status !== 'dismissed') return before
        await tx`UPDATE plan_items SET status = 'open', updated_at = now() WHERE id = ${input.id} AND user_id = ${ctx.userId}`
        if (before.kind === 'task' && !isSession(before)) {
          await tx`
            UPDATE plan_items SET status = 'open', subtype = NULL, updated_at = now()
            WHERE user_id = ${ctx.userId} AND kind = 'task' AND source_type = ${SESSION_SOURCE_TYPE} AND source_id = ${input.id}
              AND subtype = ${CLOSED_WITH_TODO}
          `
        }
        const item = await fetchOne(tx, ctx.userId, input.id)
        await dispatchChange(tx, ctx.userId, before, item, input.workspaceId)
        return item
      })
    }),

  /**
   * Undo of an accepted draft: each item's time and estimate as they were,
   * and (with `sessions`) the sessions the draft booked gone, all in one
   * transaction. See planItemsRevertInput.
   */
  revert: publicProcedure
    .input(planItemsRevertInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const out: PlanItem[] = []
        for (const it of input.items) {
          const current = await fetchOne(tx, ctx.userId, it.id)
          if (it.sessions) {
            const booked = await tx`
              DELETE FROM plan_items
              WHERE user_id = ${ctx.userId} AND kind = 'task' AND source_type = ${SESSION_SOURCE_TYPE} AND source_id = ${it.id}
                AND status IN ('open', 'done')
                ${it.sessions.length ? tx`AND id NOT IN ${tx(it.sessions)}` : tx``}
              RETURNING id
            `
            for (const s of booked) await setCourse(tx, ctx.userId, s.id as string, null)
          }
          assertValid({ ...current, starts_at: it.starts_at, ends_at: it.ends_at, duration_min: it.duration_min })
          await tx`
            UPDATE plan_items SET starts_at = ${it.starts_at}, ends_at = ${it.ends_at}, duration_min = ${it.duration_min}, updated_at = now()
            WHERE id = ${it.id} AND user_id = ${ctx.userId}
          `
          const item = await fetchOne(tx, ctx.userId, it.id)
          await dispatchChange(tx, ctx.userId, current, item, input.workspaceId ?? null)
          out.push(item)
        }
        return out
      })
    }),
})
