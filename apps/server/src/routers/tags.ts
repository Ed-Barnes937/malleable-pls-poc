import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { dispatchWorkflows } from '../workflows/dispatch'

const scopeInput = z.object({
  courseTag: z.string().max(500).optional(),
  recordingId: z.string().max(255).optional(),
  timeframe: z.enum(['week', 'all']).optional(),
})

export const tagsRouter = router({
  list: publicProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        if (input.recordingId) {
          return tx`
            SELECT t.* FROM tags t
            JOIN transcript_segments ts ON ts.id = t.target_id AND t.target_type = 'transcript_segment'
            WHERE ts.recording_id = ${input.recordingId} AND t.user_id = ${ctx.userId}
            ORDER BY t.created_at DESC
          `
        }
        return tx`SELECT * FROM tags WHERE user_id = ${ctx.userId} ORDER BY created_at DESC`
      })
    }),

  forTarget: publicProcedure
    .input(z.object({ targetType: z.string().max(255), targetId: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
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
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const [tag] = await tx`
          INSERT INTO tags (user_id, target_type, target_id, label)
          VALUES (${ctx.userId}, ${input.target_type}, ${input.target_id}, ${input.label})
          RETURNING *
        `
        await dispatchWorkflows(tx, ctx.userId, 'tag:created', input, null)
        return tag
      })
    }),

  delete: publicProcedure
    .input(z.string().max(255))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx`DELETE FROM tags WHERE id = ${input} AND user_id = ${ctx.userId}`
      })
    }),
})
