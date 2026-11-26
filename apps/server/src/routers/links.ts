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

  // Links out of the moments of a lecture's recordings (its course is the
  // board's, so no course filter is needed).
  byLecture: publicProcedure
    .input(z.object({ lectureId: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT l.source_type AS "sourceType", l.source_id AS "sourceId",
                 ts.text AS "sourceTitle", r.created_at AS "sourceDate",
                 l.relationship
          FROM links l
          JOIN transcript_segments ts ON ts.id = l.source_id
          JOIN recordings r ON r.id = ts.recording_id
          WHERE r.lecture_id = ${input.lectureId}
            AND l.user_id = ${ctx.userId}
          ORDER BY r.created_at, ts.start_ms
        `
      })
    }),
})
