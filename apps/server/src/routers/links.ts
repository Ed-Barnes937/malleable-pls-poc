import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { andInCourse, courseTag } from './_shared'

export const linksRouter = router({
  // Links touching one concept segment. Course scope keeps the connected
  // (source) moments whose lecture is in the course.
  connections: publicProcedure
    .input(z.object({ segmentId: z.string().max(255), courseTag }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT l.source_type AS "sourceType", l.source_id AS "sourceId",
                 ts.text AS "sourceTitle", r.created_at AS "sourceDate",
                 l.relationship
          FROM links l
          JOIN transcript_segments ts ON ts.id = l.source_id
          JOIN recordings r ON r.id = ts.recording_id
          WHERE (l.target_id = ${input.segmentId} OR l.source_id = ${input.segmentId})
            AND l.user_id = ${ctx.userId}
            ${andInCourse(tx, ctx.userId, input.courseTag, 'recording', tx`r.id`)}
        `
      })
    }),

  // Links out of one lecture's moments. Course scope keeps links whose other
  // end (a moment or a whole lecture) is in the course.
  byRecording: publicProcedure
    .input(z.object({ recordingId: z.string().max(255), courseTag }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT l.source_type AS "sourceType", l.source_id AS "sourceId",
                 ts.text AS "sourceTitle", r.created_at AS "sourceDate",
                 l.relationship
          FROM links l
          JOIN transcript_segments ts ON ts.id = l.source_id
          JOIN recordings r ON r.id = ts.recording_id
          LEFT JOIN transcript_segments target_ts
            ON l.target_type = 'transcript_segment' AND target_ts.id = l.target_id
          WHERE ts.recording_id = ${input.recordingId}
            AND l.user_id = ${ctx.userId}
            ${andInCourse(tx, ctx.userId, input.courseTag, 'recording',
              tx`COALESCE(target_ts.recording_id, CASE WHEN l.target_type = 'recording' THEN l.target_id END)`)}
        `
      })
    }),
})
