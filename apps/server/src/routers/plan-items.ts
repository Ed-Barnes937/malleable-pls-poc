import { z } from 'zod'
import type { JSONValue, TransactionSql } from 'postgres'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { expandPlanItems, validatePlanItem } from '@pls/substrate'
import type { PlanItem, PlanItemQuery, NewPlanItem } from '@pls/substrate'
import { dispatchWorkflows } from '../workflows/dispatch'

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const isoDateTime = z.iso.datetime({ offset: true })
const kind = z.enum(['commitment', 'deadline', 'task'])
const status = z.enum(['open', 'done', 'dismissed'])
const id = z.string().max(255)

const recurrence = z.object({
  freq: z.literal('weekly'),
  until: isoDateTime.optional(),
  timeZone: z.string().max(100).optional(),
})

const fields = {
  title: z.string().min(1).max(500),
  starts_at: isoDateTime.nullable().optional(),
  ends_at: isoDateTime.nullable().optional(),
  due_at: isoDateTime.nullable().optional(),
  duration_min: z.number().int().positive().max(24 * 60 * 7).nullable().optional(),
  status: status.optional(),
  recurrence: recurrence.nullable().optional(),
  subtype: z.string().max(100).nullable().optional(),
  source_type: z.string().max(255).nullable().optional(),
  source_id: z.string().max(255).nullable().optional(),
  source_offset_ms: z.number().int().nonnegative().nullable().optional(),
  course: z.string().max(500).nullable().optional(),
}

const newPlanItem = z.object({ kind, ...fields })

const planItemPatch = z.object({ kind: kind.optional(), ...fields, title: fields.title.optional() })

const listInput = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  kinds: z.array(kind).max(3).optional(),
  statuses: z.array(status).max(3).optional(),
  courseTag: z.string().max(500).optional(),
  sourceType: z.string().max(255).optional(),
  sourceId: z.string().max(255).optional(),
}).refine((q) => (q.from == null) === (q.to == null), { message: 'from and to must be given together' })
  .refine((q) => q.from == null || Date.parse(q.from) < Date.parse(q.to!), { message: 'from must be before to' })
  .optional()

// ---------------------------------------------------------------------------
// Course (stored as a 'plan_item' tag, like recordings carry theirs)
//
// Every course read and write for plan items goes through these helpers, so a
// shared courseTag helper can replace them in one place. In v1 a plan item's
// tags are its course: setting a course replaces them.
// ---------------------------------------------------------------------------

function courseColumn(tx: TransactionSql) {
  return tx`(
    SELECT t.label FROM tags t
    WHERE t.target_type = 'plan_item' AND t.target_id = p.id
    ORDER BY t.created_at, t.id LIMIT 1
  ) AS course`
}

function courseFilter(tx: TransactionSql, courseTag: string | undefined) {
  if (!courseTag) return tx``
  return tx`AND EXISTS (
    SELECT 1 FROM tags t
    WHERE t.target_type = 'plan_item' AND t.target_id = p.id AND t.label = ${courseTag}
  )`
}

async function setCourse(tx: TransactionSql, userId: string, planItemId: string, course: string | null) {
  await tx`DELETE FROM tags WHERE target_type = 'plan_item' AND target_id = ${planItemId} AND user_id = ${userId}`
  if (course) {
    await tx`
      INSERT INTO tags (user_id, target_type, target_id, label)
      VALUES (${userId}, 'plan_item', ${planItemId}, ${course})
    `
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

const iso = (v: unknown) => (v == null ? null : (v as Date).toISOString())

function toPlanItem(row: Row): PlanItem {
  return {
    id: row.id as string,
    kind: row.kind as PlanItem['kind'],
    title: row.title as string,
    starts_at: iso(row.starts_at),
    ends_at: iso(row.ends_at),
    due_at: iso(row.due_at),
    duration_min: (row.duration_min as number | null) ?? null,
    status: row.status as PlanItem['status'],
    recurrence: (row.recurrence as PlanItem['recurrence']) ?? null,
    subtype: (row.subtype as string | null) ?? null,
    source_type: (row.source_type as string | null) ?? null,
    source_id: (row.source_id as string | null) ?? null,
    source_offset_ms: (row.source_offset_ms as number | null) ?? null,
    course: (row.course as string | null) ?? null,
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
  }
}

async function fetchOne(tx: TransactionSql, userId: string, planItemId: string): Promise<PlanItem> {
  const [row] = await tx`
    SELECT p.*, ${courseColumn(tx)} FROM plan_items p
    WHERE p.id = ${planItemId} AND p.user_id = ${userId}
  `
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan item not found' })
  return toPlanItem(row)
}

function assertValid(item: Parameters<typeof validatePlanItem>[0]) {
  const reason = validatePlanItem(item)
  if (reason) throw new TRPCError({ code: 'BAD_REQUEST', message: reason })
}

/** Workflow event payload: the fields automations can match conditions on. */
function eventPayload(item: PlanItem): Record<string, unknown> {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    status: item.status,
    course: item.course,
    subtype: item.subtype,
    source_type: item.source_type,
    source_id: item.source_id,
    source_offset_ms: item.source_offset_ms,
  }
}

type Stored = Omit<NewPlanItem, 'course'>

/** Every stored column of a plan item, for INSERT and UPDATE alike. */
function columns(tx: TransactionSql, item: Stored) {
  return {
    kind: item.kind,
    title: item.title,
    starts_at: item.starts_at ?? null,
    ends_at: item.ends_at ?? null,
    due_at: item.due_at ?? null,
    duration_min: item.duration_min ?? null,
    status: item.status ?? 'open',
    recurrence: item.recurrence ? tx.json({ ...item.recurrence } as JSONValue) : null,
    subtype: item.subtype ?? null,
    source_type: item.source_type ?? null,
    source_id: item.source_id ?? null,
    source_offset_ms: item.source_offset_ms ?? null,
  }
}

/** Sets the status; returns the item and whether the status actually changed. */
async function setStatus(tx: TransactionSql, userId: string, planItemId: string, next: PlanItem['status']) {
  const before = await fetchOne(tx, userId, planItemId)
  if (before.status === next) return { item: before, changed: false }
  await tx`
    UPDATE plan_items SET status = ${next}, updated_at = now()
    WHERE id = ${planItemId} AND user_id = ${userId}
  `
  return { item: await fetchOne(tx, userId, planItemId), changed: true }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const planItemsRouter = router({
  /**
   * Plan items matching the filters. With `from`/`to`, weekly recurrences are
   * expanded into one row per occurrence in [from, to) and undated items are
   * left out; without a range every matching item is returned once, as stored.
   */
  list: publicProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const query: PlanItemQuery = input ?? {}
      return withUser(ctx.userId, async (tx) => {
        const rangeFilter = query.from && query.to
          ? tx`AND (
              (p.recurrence IS NOT NULL AND p.starts_at < ${query.to}
                AND (p.recurrence->>'until' IS NULL OR (p.recurrence->>'until')::timestamptz >= ${query.from}::timestamptz - interval '7 days'))
              OR (p.starts_at < ${query.to} AND p.ends_at > ${query.from})
              OR (p.due_at >= ${query.from} AND p.due_at < ${query.to})
            )`
          : tx``
        const rows = await tx`
          SELECT p.*, ${courseColumn(tx)} FROM plan_items p
          WHERE p.user_id = ${ctx.userId}
            ${query.kinds?.length ? tx`AND p.kind IN ${tx(query.kinds)}` : tx``}
            ${query.statuses?.length ? tx`AND p.status IN ${tx(query.statuses)}` : tx``}
            ${query.sourceType ? tx`AND p.source_type = ${query.sourceType}` : tx``}
            ${query.sourceId ? tx`AND p.source_id = ${query.sourceId}` : tx``}
            ${courseFilter(tx, query.courseTag)}
            ${rangeFilter}
        `
        return expandPlanItems(rows.map(toPlanItem), query)
      })
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
    .input(newPlanItem)
    .mutation(async ({ ctx, input }) => {
      assertValid(input)
      return withUser(ctx.userId, async (tx) => {
        const [{ id: newId }] = await tx`
          INSERT INTO plan_items ${tx({ user_id: ctx.userId, ...columns(tx, input) })}
          RETURNING id
        `
        await setCourse(tx, ctx.userId, newId, input.course ?? null)
        const item = await fetchOne(tx, ctx.userId, newId)
        await dispatchWorkflows(tx, ctx.userId, 'plan-item:created', eventPayload(item), null)
        return item
      })
    }),

  /** Patch fields; `null` clears one. Completing via `status: 'done'` also fires plan-item:completed. */
  update: publicProcedure
    .input(z.object({ id, patch: planItemPatch }))
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
        await dispatchWorkflows(tx, ctx.userId, 'plan-item:updated', eventPayload(item), null)
        if (current.status !== 'done' && item.status === 'done') {
          await dispatchWorkflows(tx, ctx.userId, 'plan-item:completed', eventPayload(item), null)
        }
        return item
      })
    }),

  complete: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const { item, changed } = await setStatus(tx, ctx.userId, input, 'done')
        if (changed) await dispatchWorkflows(tx, ctx.userId, 'plan-item:completed', eventPayload(item), null)
        return item
      })
    }),

  dismiss: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const { item, changed } = await setStatus(tx, ctx.userId, input, 'dismissed')
        if (changed) await dispatchWorkflows(tx, ctx.userId, 'plan-item:updated', eventPayload(item), null)
        return item
      })
    }),

  delete: publicProcedure
    .input(id)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        await setCourse(tx, ctx.userId, input, null)
        await tx`DELETE FROM plan_items WHERE id = ${input} AND user_id = ${ctx.userId}`
      })
    }),
})
