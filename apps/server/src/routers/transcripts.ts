import { z } from 'zod'
import { router, publicProcedure } from '../trpc'

export const transcriptsRouter = router({
  byRecording: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx`
          SELECT * FROM transcript_segments
          WHERE recording_id = ${input} AND user_id = ${ctx.userId}
          ORDER BY start_ms
        `
      })
    }),
})
