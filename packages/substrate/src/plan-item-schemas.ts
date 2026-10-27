/**
 * Input schemas for the planItems procedures. Shared by the server router and
 * the CT backend simulator so both accept and reject exactly the same inputs.
 * Timestamps are normalised to UTC `Z` strings on parse, as Postgres does.
 * Unknown keys (e.g. `occurrence_key` or `series_starts_at` copied off a list
 * row) are stripped.
 */
import { z } from 'zod'

const isoDateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString())
const kind = z.enum(['commitment', 'deadline', 'task'])
const status = z.enum(['open', 'done', 'dismissed'])

export const planItemIdInput = z.string().max(255)

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

export const newPlanItemInput = z.object({ kind, ...fields })

export const planItemUpdateInput = z.object({
  id: planItemIdInput,
  patch: z.object({ kind: kind.optional(), ...fields, title: fields.title.optional() }),
})

/**
 * The board (workspace) a change is made from, so that board's automations
 * run. Optional: changes made outside a board run the built-in ones.
 */
export const boardIdInput = z.string().max(255).nullable().optional()

export const newPlanItemOnBoardInput = newPlanItemInput.extend({ workspaceId: boardIdInput })
export const planItemUpdateOnBoardInput = planItemUpdateInput.extend({ workspaceId: boardIdInput })

/** complete / dismiss: the id, or `{ id, workspaceId }` from a board. */
export const planItemOnBoardInput = z
  .union([planItemIdInput, z.object({ id: planItemIdInput, workspaceId: boardIdInput })])
  .transform((v) => (typeof v === 'string' ? { id: v, workspaceId: null } : { id: v.id, workspaceId: v.workspaceId ?? null }))

export const planItemListInput = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  kinds: z.array(kind).max(3).optional(),
  statuses: z.array(status).max(3).optional(),
  scheduled: z.boolean().optional(),
  courseTag: z.string().max(500).optional(),
  sourceType: z.string().max(255).optional(),
  sourceId: z.string().max(255).optional(),
}).refine((q) => (q.from == null) === (q.to == null), { message: 'from and to must be given together' })
  .refine((q) => q.from == null || Date.parse(q.from) < Date.parse(q.to!), { message: 'from must be before to' })
  .optional()

/** Parses `input` with `schema`, throwing a plain Error listing the issues (for non-tRPC callers). */
export function parsePlanItemInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join('; '))
  return result.data
}
