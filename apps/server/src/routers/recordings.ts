import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import type { LectureProcessing } from '@pls/substrate'
import { andInCourse, courseTag, recordingCourse } from './_shared'

export const recordingsRouter = router({
  list: publicProcedure
    .input(z.object({
      courseTag,
      recordingId: z.string().max(255).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        if (input?.recordingId) {
          return tx`
            SELECT r.*, ${recordingCourse(tx, tx`r.id`)} AS course FROM recordings r
            WHERE r.id = ${input.recordingId} AND r.user_id = ${ctx.userId}
          `
        }
        if (input?.courseTag) {
          return tx`
            SELECT r.*, ${recordingCourse(tx, tx`r.id`)} AS course FROM recordings r
            WHERE r.user_id = ${ctx.userId}
              ${andInCourse(tx, ctx.userId, input.courseTag, 'recording', tx`r.id`)}
            ORDER BY r.created_at DESC
          `
        }
        return tx`
          SELECT r.*, ${recordingCourse(tx, tx`r.id`)} AS course FROM recordings r
          WHERE r.user_id = ${ctx.userId} ORDER BY r.created_at DESC
        `
      })
    }),

  byId: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [row] = await tx`
          SELECT r.*, ${recordingCourse(tx, tx`r.id`)} AS course FROM recordings r
          WHERE r.id = ${input} AND r.user_id = ${ctx.userId}
        `
        if (!row) return null
        // What the lecture's AI jobs are still doing, so the transcript can say
        // so instead of sitting empty. Transcription comes first.
        const [busy] = await tx`
          SELECT job_type FROM job_runs
          WHERE user_id = ${ctx.userId}
            AND status IN ('pending', 'running')
            AND job_type IN ('ai:transcribe', 'ai:summarize-lecture')
            AND COALESCE(input->>'recording_id', input->>'target_id') = ${input}
          ORDER BY (job_type = 'ai:transcribe') DESC
          LIMIT 1
        `
        const processing: LectureProcessing | null = !busy
          ? null
          : busy.job_type === 'ai:transcribe' ? 'transcribing' : 'summarising'
        return Object.assign(row, { processing })
      })
    }),
})
