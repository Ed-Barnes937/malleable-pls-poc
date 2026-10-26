import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { COURSE_LABELS, andInCourse, courseTag } from './_shared'

export const aggregatesRouter = router({
  weeklyOverview: publicProcedure
    .input(z.object({ courseTag }).optional())
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          WITH course_segments AS (
            SELECT t.label AS course, ts.id AS seg_id
            FROM tags t
            JOIN recordings r ON r.id = t.target_id AND t.target_type = 'recording'
            JOIN transcript_segments ts ON ts.recording_id = r.id
            WHERE t.user_id = ${ctx.userId}
              AND t.label IN ${tx(COURSE_LABELS)}
              ${andInCourse(tx, ctx.userId, input?.courseTag, 'recording', tx`r.id`)}
          ),
          seg_confidence AS (
            SELECT cs.target_id AS seg_id,
                   MAX(cs.score) AS max_score
            FROM confidence_signals cs
            WHERE cs.user_id = ${ctx.userId} AND cs.target_type = 'transcript_segment'
            GROUP BY cs.target_id
          ),
          gap_tags AS (
            SELECT t2.target_id AS seg_id
            FROM tags t2
            WHERE t2.user_id = ${ctx.userId} AND t2.label = 'confused'
          )
          SELECT
            cs.course,
            COUNT(*)::int AS "totalSegments",
            COUNT(CASE WHEN COALESCE(sc.max_score, 0) >= 70 THEN 1 END)::int AS "confidentSegments",
            COUNT(CASE WHEN gt.seg_id IS NOT NULL THEN 1 END)::int AS "gapCount",
            CASE WHEN COUNT(*) > 0
              THEN ROUND(COUNT(CASE WHEN COALESCE(sc.max_score, 0) >= 70 THEN 1 END)::numeric / COUNT(*)::numeric * 100)::int
              ELSE 0
            END AS percentage
          FROM course_segments cs
          LEFT JOIN seg_confidence sc ON sc.seg_id = cs.seg_id
          LEFT JOIN gap_tags gt ON gt.seg_id = cs.seg_id
          GROUP BY cs.course
          ORDER BY cs.course
        `
      })
    }),

  // Unfiltered by design: the All courses widget highlights the board course
  // rather than hiding the others.
  gapAnalysis: publicProcedure
    .query(async ({ ctx }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          WITH course_segments AS (
            SELECT t.label AS course, ts.id AS seg_id
            FROM tags t
            JOIN recordings r ON r.id = t.target_id AND t.target_type = 'recording'
            JOIN transcript_segments ts ON ts.recording_id = r.id
            WHERE t.user_id = ${ctx.userId}
              AND t.label IN ${tx(COURSE_LABELS)}
          ),
          seg_confidence AS (
            SELECT cs.target_id AS seg_id, MAX(cs.score) AS max_score
            FROM confidence_signals cs
            WHERE cs.user_id = ${ctx.userId} AND cs.target_type = 'transcript_segment'
            GROUP BY cs.target_id
          )
          SELECT
            cs.course,
            CASE WHEN COUNT(*) > 0
              THEN ROUND(COUNT(CASE WHEN COALESCE(sc.max_score, 0) >= 70 THEN 1 END)::numeric / COUNT(*)::numeric * 100)::int
              ELSE 0
            END AS percentage,
            COUNT(CASE WHEN COALESCE(sc.max_score, 0) < 40 THEN 1 END)::int AS "weakAreaCount"
          FROM course_segments cs
          LEFT JOIN seg_confidence sc ON sc.seg_id = cs.seg_id
          GROUP BY cs.course
          ORDER BY cs.course
        `
      })
    }),

  weakestTopics: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(10),
      courseTag,
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10
      return withUser(ctx.userId, async (tx) => {
        // The course filter applies before ranking, so a filtered list is
        // ranked 1..N within the course.
        return tx`
          WITH seg_confidence AS (
            SELECT cs.target_id AS seg_id, AVG(cs.score) AS avg_score
            FROM confidence_signals cs
            WHERE cs.user_id = ${ctx.userId} AND cs.target_type = 'transcript_segment'
            GROUP BY cs.target_id
          ),
          ranked AS (
            SELECT
              ts.text AS "conceptLabel",
              t.label AS course,
              'Week 1' AS week,
              COALESCE(sc.avg_score, 0) AS "avgConfidence",
              ROW_NUMBER() OVER (ORDER BY COALESCE(sc.avg_score, 100) ASC) AS rank
            FROM transcript_segments ts
            JOIN recordings r ON r.id = ts.recording_id
            JOIN tags t ON t.target_type = 'recording' AND t.target_id = r.id
              AND t.label IN ${tx(COURSE_LABELS)}
            LEFT JOIN seg_confidence sc ON sc.seg_id = ts.id
            WHERE ts.user_id = ${ctx.userId}
              ${andInCourse(tx, ctx.userId, input?.courseTag, 'recording', tx`r.id`)}
          )
          SELECT rank::int, "conceptLabel", course, week, "avgConfidence"
          FROM ranked
          WHERE rank <= ${limit}
          ORDER BY rank
        `
      })
    }),
})
