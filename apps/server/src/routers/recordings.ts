import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { boardIdInput, type LectureProcessing } from '@pls/substrate'
import { createPgAdapter } from '../workflows/pg-adapter'
import { andInCourse, courseTag, recordingCourse, requireOwnBoard } from './_shared'

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

  /**
   * Transcribes a lecture by hand: for one the automations never picked up
   * (the student switched transcription off or deleted it). Queues the same
   * job the automation would, and its `recording:transcribed` event carries on
   * as usual (e.g. to the summary). `queued` is false when there is nothing
   * to do: it already has a transcript or one is already on its way.
   */
  transcribe: publicProcedure
    .input(z.object({ recordingId: z.string().max(255), workspaceId: boardIdInput }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        if (input.workspaceId) await requireOwnBoard(tx, ctx.userId, input.workspaceId)
        const [recording] = await tx`
          SELECT id FROM recordings WHERE id = ${input.recordingId} AND user_id = ${ctx.userId} FOR UPDATE
        `
        if (!recording) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecture not found' })
        const [segment] = await tx`
          SELECT 1 FROM transcript_segments WHERE recording_id = ${input.recordingId} AND user_id = ${ctx.userId} LIMIT 1
        `
        const [busy] = await tx`
          SELECT 1 FROM job_runs
          WHERE user_id = ${ctx.userId} AND job_type = 'ai:transcribe' AND status IN ('pending', 'running')
            AND COALESCE(input->>'recording_id', input->>'target_id') = ${input.recordingId}
          LIMIT 1
        `
        if (segment || busy) return { queued: false }
        // Not run by an automation, so there is no workflow to name.
        await createPgAdapter({ tx, userId: ctx.userId }).enqueueJobRun({
          workflowId: 'manual', workflowJobId: 'manual', jobType: 'ai:transcribe',
          input: { recording_id: input.recordingId }, depth: 0, scopeId: input.workspaceId ?? null,
        })
        return { queued: true }
      })
    }),
})
