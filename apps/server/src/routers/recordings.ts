import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { boardIdInput, type LectureProcessing } from '@pls/substrate'
import { createPgAdapter } from '../workflows/pg-adapter'
import { andInCourse, courseTag, recordingCourse, recordingProcessing, requireOwnBoard } from './_shared'

/** job_runs requires a workflow and job id; a run started by hand has neither, so it carries this. */
const MANUAL_RUN = 'manual'

export const recordingsRouter = router({
  list: publicProcedure
    .input(z.object({
      courseTag,
      lectureId: z.string().max(255).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT r.*, ${recordingCourse(tx, tx`r.id`)} AS course FROM recordings r
          WHERE r.user_id = ${ctx.userId}
            ${andInCourse(tx, ctx.userId, input?.courseTag, 'recording', tx`r.id`)}
            ${input?.lectureId ? tx`AND r.lecture_id = ${input.lectureId}` : tx``}
          ORDER BY r.created_at DESC
        `
      })
    }),

  byId: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        // `processing`: what its AI jobs are still doing, so the transcript
        // can say so instead of sitting empty.
        const [row] = await tx`
          SELECT r.*, ${recordingCourse(tx, tx`r.id`)} AS course,
                 ${recordingProcessing(tx, ctx.userId, tx`r.id`)} AS processing
          FROM recordings r
          WHERE r.id = ${input} AND r.user_id = ${ctx.userId}
        `
        return (row ?? null) as (typeof row & { processing: LectureProcessing | null }) | null
      })
    }),

  /**
   * Transcribes a lecture by hand: for one the automations never picked up
   * (the student switched transcription off or deleted it). Queues the same
   * job the automation would, and its `recording:transcribed` event carries on
   * as usual (e.g. to the summary). `queued` is false when there is nothing
   * to do: it was already transcribed (even if nothing was said) or a transcript is already on its way.
   */
  transcribe: publicProcedure
    .input(z.object({ recordingId: z.string().max(255), workspaceId: boardIdInput }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        if (input.workspaceId) await requireOwnBoard(tx, ctx.userId, input.workspaceId)
        const [recording] = await tx`
          SELECT id, status FROM recordings WHERE id = ${input.recordingId} AND user_id = ${ctx.userId} FOR UPDATE
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
        // 'ready' means transcription ran (a silent lecture ends up with no
        // segments): never bill the provider for it again.
        if (recording.status === 'ready' || segment || busy) return { queued: false }
        await createPgAdapter({ tx, userId: ctx.userId }).enqueueJobRun({
          workflowId: MANUAL_RUN, workflowJobId: MANUAL_RUN, jobType: 'ai:transcribe',
          input: { recording_id: input.recordingId }, depth: 0, scopeId: input.workspaceId ?? null,
        })
        return { queued: true }
      })
    }),
})
