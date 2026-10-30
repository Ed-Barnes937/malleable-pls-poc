import type { JSONValue, TransactionSql } from 'postgres'
import { TRPCError } from '@trpc/server'
import { expandPlanItems, validatePlanItem } from '@pls/substrate'
import { andInCourse } from '../routers/_shared'
import { studentTimeZone } from '../preferences/store'
import type { PlanItem, PlanItemOccurrence, PlanItemQuery, NewPlanItem } from '@pls/substrate'

// Plan item reads and writes shared by the planItems router and server-side
// writers (e.g. the plan:review-task executor), so every path stores, filters
// and reports plan items the same way.

// ---------------------------------------------------------------------------
// Course (stored as a 'plan_item' tag, like recordings carry theirs)
//
// Board course filtering uses the shared `andInCourse` helper (see
// ../routers/_shared.ts). In v1 a plan item's tags are its course: setting a
// course replaces them.
// ---------------------------------------------------------------------------

export function courseColumn(tx: TransactionSql) {
  return tx`(
    SELECT t.label FROM tags t
    WHERE t.target_type = 'plan_item' AND t.target_id = p.id
    ORDER BY t.created_at, t.id LIMIT 1
  ) AS course`
}

export async function setCourse(tx: TransactionSql, userId: string, planItemId: string, course: string | null) {
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

export function toPlanItem(row: Row): PlanItem {
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
    created_by_workflow_id: (row.created_by_workflow_id as string | null) ?? null,
    course: (row.course as string | null) ?? null,
    time_zone: (row.time_zone as string | null) ?? null,
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
  }
}

export async function fetchOne(tx: TransactionSql, userId: string, planItemId: string): Promise<PlanItem> {
  const [row] = await tx`
    SELECT p.*, ${courseColumn(tx)} FROM plan_items p
    WHERE p.id = ${planItemId} AND p.user_id = ${userId}
  `
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan item not found' })
  return toPlanItem(row)
}

export function assertValid(item: Parameters<typeof validatePlanItem>[0]) {
  const reason = validatePlanItem(item)
  if (reason) throw new TRPCError({ code: 'BAD_REQUEST', message: reason })
}

/** Workflow event payload: the fields automations can match conditions on. */
export function eventPayload(item: PlanItem): Record<string, unknown> {
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

export type Stored = Omit<NewPlanItem, 'course'>

/** Every stored column of a plan item, for INSERT and UPDATE alike. */
export function columns(tx: TransactionSql, item: Stored) {
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
    created_by_workflow_id: item.created_by_workflow_id ?? null,
  }
}

/**
 * Plan items matching `query`, as planItems.list returns them: with
 * `from`/`to`, weekly recurrences expand into one row per occurrence.
 */
export async function listPlanItems(tx: TransactionSql, userId: string, query: PlanItemQuery = {}): Promise<PlanItemOccurrence[]> {
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
    WHERE p.user_id = ${userId}
      ${query.kinds?.length ? tx`AND p.kind IN ${tx(query.kinds)}` : tx``}
      ${query.statuses?.length ? tx`AND p.status IN ${tx(query.statuses)}` : tx``}
      ${query.scheduled === true ? tx`AND p.starts_at IS NOT NULL` : query.scheduled === false ? tx`AND p.starts_at IS NULL` : tx``}
      ${query.sourceType ? tx`AND p.source_type = ${query.sourceType}` : tx``}
      ${query.sourceId ? tx`AND p.source_id = ${query.sourceId}` : tx``}
      ${andInCourse(tx, userId, query.courseTag, 'plan_item', tx`p.id`)}
      ${rangeFilter}
  `
  return expandPlanItems(rows.map(toPlanItem), query)
}

/**
 * Inserts a plan item with its course and returns it as stored. Validates
 * first. The item keeps the student's zone as it is now (`time_zone`, see
 * PlanItem): their preference, else `browserZone`, else the demo's.
 */
export async function insertPlanItem(
  tx: TransactionSql,
  userId: string,
  input: NewPlanItem,
  browserZone?: string | null,
): Promise<PlanItem> {
  assertValid(input)
  const timeZone = await studentTimeZone(tx, userId, browserZone)
  const [{ id: newId }] = await tx`
    INSERT INTO plan_items ${tx({ user_id: userId, ...columns(tx, input), time_zone: timeZone })}
    RETURNING id
  `
  await setCourse(tx, userId, newId, input.course ?? null)
  return fetchOne(tx, userId, newId)
}
