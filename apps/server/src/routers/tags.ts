import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { TransactionSql } from 'postgres'
import { boardIdInput, REVIEW_SUBTYPE, SORTED_TAG } from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { dispatchWorkflows } from '../workflows/dispatch'
import { boardScope, andInScope, isCourse, isScoped } from './_shared'
import { changeStatus } from './plan-items'

const momentInput = z.object({ segmentId: z.string().max(255), workspaceId: boardIdInput })

/**
 * A transcript moment's place in its lecture (what its reviews link to),
 * serialised with the confusion automation's review for it (the same lock as
 * `createReview`), so a review being made as the moment is sorted is either
 * dismissed here or never made. NOT_FOUND if the moment is gone.
 */
async function lockMoment(tx: TransactionSql, userId: string, segmentId: string) {
  const [seg] = await tx`
    SELECT recording_id, start_ms FROM transcript_segments WHERE id = ${segmentId} AND user_id = ${userId}
  `
  if (!seg) throw new TRPCError({ code: 'NOT_FOUND', message: 'That moment is gone' })
  const moment = { recordingId: seg.recording_id as string, startMs: seg.start_ms as number }
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`review:${userId}:${moment.recordingId}:${moment.startMs}`}))`
  return moment
}

/** The moment's review to-dos with this status (the confusion automation's, linked to it). */
async function momentReviews(tx: TransactionSql, userId: string, moment: { recordingId: string; startMs: number }, status: string) {
  const rows = await tx`
    SELECT id FROM plan_items
    WHERE user_id = ${userId} AND kind = 'task' AND status = ${status} AND subtype = ${REVIEW_SUBTYPE}
      AND source_type = 'recording' AND source_id = ${moment.recordingId} AND source_offset_ms = ${moment.startMs}
    ORDER BY created_at, id
  `
  return rows.map((r) => r.id as string)
}

export const tagsRouter = router({
  list: publicProcedure
    .input(boardScope)
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        if (!isScoped(input)) {
          return tx`SELECT * FROM tags WHERE user_id = ${ctx.userId} ORDER BY created_at DESC`
        }
        // A tag is in scope when its segment's (or its own) recording is.
        return tx`
          SELECT t.* FROM tags t
          LEFT JOIN transcript_segments ts ON ts.id = t.target_id AND t.target_type = 'transcript_segment'
          WHERE t.user_id = ${ctx.userId}
            ${andInScope(tx, ctx.userId, input,
              tx`COALESCE(ts.recording_id, CASE WHEN t.target_type = 'recording' THEN t.target_id END)`)}
          ORDER BY t.created_at DESC
        `
      })
    }),

  forTarget: publicProcedure
    .input(z.object({ targetType: z.string().max(255), targetId: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT * FROM tags
          WHERE target_type = ${input.targetType} AND target_id = ${input.targetId} AND user_id = ${ctx.userId}
        `
      })
    }),

  create: publicProcedure
    .input(z.object({
      target_type: z.string().max(255),
      target_id: z.string().max(255),
      label: z.string().max(500),
      workspaceId: boardIdInput,
    }))
    .mutation(async ({ ctx, input: { workspaceId, ...input } }) => {
      // A recording's course is its lecture's (lectures.update), never a tag.
      if (input.target_type === 'recording' && isCourse(input.label)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "A recording's course is its lecture's: set it on the lecture" })
      }
      return withUser(ctx.userId, async (tx) => {
        // Idempotent per (target, label): a moment is confusing or it isn't,
        // so a second click (or a racing one, hence the lock) returns the tag
        // already there and books nothing more.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`tag:${ctx.userId}:${input.target_type}:${input.target_id}:${input.label}`}))`
        const [existing] = await tx`
          SELECT * FROM tags
          WHERE user_id = ${ctx.userId} AND target_type = ${input.target_type}
            AND target_id = ${input.target_id} AND label = ${input.label}
          ORDER BY created_at ASC
          LIMIT 1
        `
        if (existing) return existing
        const [tag] = await tx`
          INSERT INTO tags (user_id, target_type, target_id, label)
          VALUES (${ctx.userId}, ${input.target_type}, ${input.target_id}, ${input.label})
          RETURNING *
        `
        await dispatchWorkflows(tx, ctx.userId, 'tag:created', input, workspaceId ?? null)
        return tag
      })
    }),

  delete: publicProcedure
    .input(z.string().max(255))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        await tx`DELETE FROM tags WHERE id = ${input} AND user_id = ${ctx.userId}`
      })
    }),

  /**
   * Marks a confusing moment sorted: adds its `sorted` tag (once; the
   * `confused` one stays as history) and dismisses its open review to-dos,
   * their sessions following. `dismissed` is what `unsort` can bring back.
   */
  sort: publicProcedure
    .input(momentInput)
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const moment = await lockMoment(tx, ctx.userId, input.segmentId)
        const [existing] = await tx`
          SELECT * FROM tags
          WHERE user_id = ${ctx.userId} AND target_type = 'transcript_segment' AND target_id = ${input.segmentId}
            AND label = ${SORTED_TAG}
          LIMIT 1
        `
        const [tag] = existing ? [existing] : await tx`
          INSERT INTO tags (user_id, target_type, target_id, label)
          VALUES (${ctx.userId}, 'transcript_segment', ${input.segmentId}, ${SORTED_TAG})
          RETURNING *
        `
        const dismissed = await momentReviews(tx, ctx.userId, moment, 'open')
        for (const id of dismissed) await changeStatus(tx, ctx.userId, id, 'dismissed', input.workspaceId ?? null)
        return { tag, dismissed }
      })
    }),

  /**
   * Un-sorts a moment: removes its `sorted` tag, so it is one to review
   * again. `restore` (from `sort`, for its Undo) reopens those of its review
   * to-dos that are still dismissed; any other id is ignored.
   */
  unsort: publicProcedure
    .input(momentInput.extend({ restore: z.array(z.string().max(255)).max(100).optional() }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const moment = await lockMoment(tx, ctx.userId, input.segmentId)
        await tx`
          DELETE FROM tags
          WHERE user_id = ${ctx.userId} AND target_type = 'transcript_segment' AND target_id = ${input.segmentId}
            AND label = ${SORTED_TAG}
        `
        const wanted = new Set(input.restore ?? [])
        const restored = (await momentReviews(tx, ctx.userId, moment, 'dismissed')).filter((id) => wanted.has(id))
        for (const id of restored) await changeStatus(tx, ctx.userId, id, 'open', input.workspaceId ?? null)
        return { restored }
      })
    }),
})
