import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser, type TxSql } from '@pls/db'
import { REVIEW_SUBTYPE, SOLID_FROM, WEAK_BELOW, keyPhrase, topicLabel, type CourseProgress, type WeakTopic } from '@pls/substrate'
import { COURSE_LABELS, andInCourse, courseTag } from './_shared'

/**
 * Every lecture moment in a course, with its status: the SQL twin of
 * `momentStatus` (packages/substrate/src/moments.ts), so Your progress, All
 * courses and Weak topics count the same moments. One row per moment and
 * course its lecture is filed under.
 */
function courseMoments(tx: TxSql, userId: string, course: string | undefined) {
  return tx`
    SELECT
      ts.id AS seg_id,
      ts.recording_id,
      ts.start_ms,
      ts.text,
      LAG(ts.text) OVER w AS before_text,
      LEAD(ts.text) OVER w AS after_text,
      r.title AS recording_title,
      r.created_at AS recording_at,
      t.label AS course,
      latest.score AS latest_score,
      marked.confused_at,
      still.confused,
      CASE
        WHEN latest.score < ${WEAK_BELOW} OR still.confused THEN 'review'
        WHEN latest.score >= ${SOLID_FROM} THEN 'solid'
        ELSE 'learning'
      END AS status
    FROM transcript_segments ts
    JOIN recordings r ON r.id = ts.recording_id
    JOIN tags t ON t.user_id = ${userId} AND t.target_type = 'recording' AND t.target_id = r.id
      AND t.label IN ${tx(COURSE_LABELS)}
    LEFT JOIN LATERAL (
      SELECT cs.score, cs.created_at FROM confidence_signals cs
      WHERE cs.user_id = ${userId} AND cs.target_type = 'transcript_segment' AND cs.target_id = ts.id
      ORDER BY cs.created_at DESC, cs.id DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT MAX(c.created_at) AS confused_at FROM tags c
      WHERE c.user_id = ${userId} AND c.target_type = 'transcript_segment' AND c.target_id = ts.id
        AND c.label = 'confused'
    ) marked ON true
    -- Marked confusing and not felt sure about since.
    CROSS JOIN LATERAL (
      SELECT marked.confused_at IS NOT NULL
        AND NOT COALESCE(latest.score >= ${SOLID_FROM} AND latest.created_at > marked.confused_at, false) AS confused
    ) still
    WHERE ts.user_id = ${userId}
      ${andInCourse(tx, userId, course, 'recording', tx`r.id`)}
    WINDOW w AS (PARTITION BY ts.recording_id, t.label ORDER BY ts.start_ms)
  `
}

function courseProgress(tx: TxSql, userId: string, course: string | undefined): Promise<CourseProgress[]> {
  return tx<CourseProgress[]>`
    SELECT
      m.course,
      COUNT(*)::int AS "totalMoments",
      COUNT(*) FILTER (WHERE m.status = 'solid')::int AS "solidMoments",
      COUNT(*) FILTER (WHERE m.status = 'review')::int AS "reviewMoments",
      ROUND(COUNT(*) FILTER (WHERE m.status = 'solid')::numeric / COUNT(*)::numeric * 100)::int AS percentage
    FROM (${courseMoments(tx, userId, course)}) m
    GROUP BY m.course
    ORDER BY m.course
  `
}

export const aggregatesRouter = router({
  /** Your progress: per course, all time. */
  weeklyOverview: publicProcedure
    .input(z.object({ courseTag }).optional())
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, (tx) => courseProgress(tx, ctx.userId, input?.courseTag))
    }),

  // Unfiltered by design: the All courses widget highlights the board course
  // rather than hiding the others. Same numbers as weeklyOverview.
  gapAnalysis: publicProcedure
    .query(async ({ ctx }) => {
      return withUser(ctx.userId, (tx) => courseProgress(tx, ctx.userId, undefined))
    }),

  /**
   * The moments to review (status `review`), weakest first: lowest latest
   * rating (a confusing mark never rated counts as 0), then most recently
   * marked. Labelled with the review to-do's topic when the confusion
   * automation made one for the moment (the LLM's words in live mode), else
   * the moment's key phrase.
   */
  weakestTopics: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(10),
      courseTag,
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10
      return withUser(ctx.userId, async (tx): Promise<WeakTopic[]> => {
        // The course filter applies before ranking, so a filtered list is
        // ranked 1..N within the course.
        const rows = await tx`
          SELECT m.*, review.title AS review_title
          FROM (${courseMoments(tx, ctx.userId, input?.courseTag)}) m
          LEFT JOIN LATERAL (
            SELECT p.title FROM plan_items p
            WHERE p.user_id = ${ctx.userId} AND p.kind = 'task' AND p.subtype = ${REVIEW_SUBTYPE}
              AND p.source_type = 'recording' AND p.source_id = m.recording_id AND p.source_offset_ms = m.start_ms
            ORDER BY p.created_at DESC
            LIMIT 1
          ) review ON true
          WHERE m.status = 'review'
          ORDER BY COALESCE(m.latest_score, 0) ASC, m.confused_at DESC NULLS LAST,
            m.recording_at DESC, m.start_ms ASC, m.course ASC
          LIMIT ${limit}
        `
        return rows.map((row, i) => ({
          rank: i + 1,
          segmentId: row.seg_id as string,
          recordingId: row.recording_id as string,
          recordingTitle: row.recording_title as string,
          offsetMs: row.start_ms as number,
          label: weakTopicLabel(row),
          course: row.course as string,
          confidence: row.latest_score == null ? null : Math.round(row.latest_score as number),
          confused: row.confused as boolean,
        }))
      })
    }),
})

function weakTopicLabel(row: Record<string, unknown>): string {
  const fromReview = typeof row.review_title === 'string' ? row.review_title.replace(/^review:\s*/i, '').trim() : ''
  const text = row.text as string
  const phrase = fromReview || keyPhrase(text, { before: (row.before_text as string | null) ?? '', after: (row.after_text as string | null) ?? '' })
  return topicLabel(phrase, text)
}
