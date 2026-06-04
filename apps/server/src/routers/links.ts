import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'

export const linksRouter = router({
  connections: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT l.source_type AS "sourceType", l.source_id AS "sourceId",
                 ts.text AS "sourceTitle", r.created_at AS "sourceDate",
                 l.relationship
          FROM links l
          JOIN transcript_segments ts ON ts.id = l.source_id
          JOIN recordings r ON r.id = ts.recording_id
          WHERE (l.target_id = ${input} OR l.source_id = ${input})
            AND l.user_id = ${ctx.userId}
        `
      })
    }),

  byRecording: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT l.source_type AS "sourceType", l.source_id AS "sourceId",
                 ts.text AS "sourceTitle", r.created_at AS "sourceDate",
                 l.relationship
          FROM links l
          JOIN transcript_segments ts ON ts.id = l.source_id
          JOIN recordings r ON r.id = ts.recording_id
          WHERE ts.recording_id = ${input}
            AND l.user_id = ${ctx.userId}
        `
      })
    }),
})
