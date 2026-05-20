import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { dispatchWorkflows } from '../workflows/dispatch'

const scopeInput = z.object({
  courseTag: z.string().optional(),
  recordingId: z.string().optional(),
  timeframe: z.enum(['week', 'all']).optional(),
})

export const confidenceRouter = router({
  list: publicProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        if (input.recordingId) {
          return tx`
            SELECT cs.* FROM confidence_signals cs
            JOIN transcript_segments ts ON ts.id = cs.target_id AND cs.target_type = 'transcript_segment'
            WHERE ts.recording_id = ${input.recordingId} AND cs.user_id = ${ctx.userId}
            ORDER BY cs.created_at DESC
          `
        }
        return tx`SELECT * FROM confidence_signals WHERE user_id = ${ctx.userId} ORDER BY created_at DESC`
      })
    }),

  record: publicProcedure
    .input(z.object({
      target_type: z.string(),
      target_id: z.string(),
      score: z.number(),
      source_lens_id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const [signal] = await tx`
          INSERT INTO confidence_signals (user_id, target_type, target_id, score, source_lens_id)
          VALUES (${ctx.userId}, ${input.target_type}, ${input.target_id}, ${input.score}, ${input.source_lens_id})
          RETURNING *
        `
        await dispatchWorkflows(tx, ctx.userId, 'confidence:recorded', input, null)
        return signal
      })
    }),
})
