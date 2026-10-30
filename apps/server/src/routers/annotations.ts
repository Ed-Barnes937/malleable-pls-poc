import { z } from 'zod'
import { boardIdInput } from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { dispatchWorkflows } from '../workflows/dispatch'
import { LECTURE_SUMMARY_ANCHOR } from '@pls/substrate'
import { boardScope, andInScope, isScoped } from './_shared'

export const annotationsRouter = router({
  list: publicProcedure
    .input(boardScope)
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        if (!isScoped(input)) {
          return tx`SELECT * FROM annotations WHERE user_id = ${ctx.userId} ORDER BY created_at DESC`
        }
        // Notes on in-scope moments, plus the summaries of in-scope recordings.
        return tx`
          SELECT a.* FROM annotations a
          LEFT JOIN transcript_segments ts ON ts.id = a.anchor_id AND a.anchor_type = 'transcript_segment'
          WHERE a.user_id = ${ctx.userId}
            AND a.anchor_type IN ('transcript_segment', ${LECTURE_SUMMARY_ANCHOR})
            ${andInScope(tx, ctx.userId, input,
              tx`COALESCE(ts.recording_id, CASE WHEN a.anchor_type = ${LECTURE_SUMMARY_ANCHOR} THEN a.anchor_id END)`)}
          ORDER BY a.created_at DESC
        `
      })
    }),

  create: publicProcedure
    .input(z.object({
      anchor_type: z.string().max(255),
      anchor_id: z.string().max(255),
      anchor_start_ms: z.number().optional(),
      anchor_end_ms: z.number().optional(),
      body: z.string().max(10000),
      workspaceId: boardIdInput,
    }))
    .mutation(async ({ ctx, input: { workspaceId, ...input } }) => {
      return withUser(ctx.userId, async (tx) => {
        const [ann] = await tx`
          INSERT INTO annotations (user_id, anchor_type, anchor_id, anchor_start_ms, anchor_end_ms, body)
          VALUES (${ctx.userId}, ${input.anchor_type}, ${input.anchor_id}, ${input.anchor_start_ms ?? null}, ${input.anchor_end_ms ?? null}, ${input.body})
          RETURNING *
        `
        await dispatchWorkflows(tx, ctx.userId, 'annotation:created', input, workspaceId ?? null)
        return ann
      })
    }),
})
