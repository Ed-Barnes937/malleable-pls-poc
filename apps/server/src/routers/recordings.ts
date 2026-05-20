import { z } from 'zod'
import { router, publicProcedure } from '../trpc'

export const recordingsRouter = router({
  list: publicProcedure
    .input(z.object({
      courseTag: z.string().optional(),
      recordingId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        if (input?.recordingId) {
          return tx`
            SELECT * FROM recordings
            WHERE id = ${input.recordingId} AND user_id = ${ctx.userId}
          `
        }
        if (input?.courseTag) {
          return tx`
            SELECT r.* FROM recordings r
            JOIN tags t ON t.target_type = 'recording' AND t.target_id = r.id AND t.label = ${input.courseTag}
            WHERE r.user_id = ${ctx.userId}
            ORDER BY r.created_at DESC
          `
        }
        return tx`SELECT * FROM recordings WHERE user_id = ${ctx.userId} ORDER BY created_at DESC`
      })
    }),

  byId: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const [row] = await tx`
          SELECT * FROM recordings WHERE id = ${input} AND user_id = ${ctx.userId}
        `
        return row ?? null
      })
    }),
})
