import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { retryLimitFor } from '../workflows/job-runner'

export const jobsRouter = router({
  recent: publicProcedure
    .input(z.number().optional().default(5))
    .query(async ({ ctx, input }) => {
      const rows = await withUser(ctx.userId, (tx) => tx`
        SELECT * FROM job_runs
        WHERE user_id = ${ctx.userId}
        ORDER BY created_at DESC
        LIMIT ${input}
      `)
      // `retryable`: failed with automatic retries exhausted (per job type), so
      // the student can retry it by hand. Earlier failed attempts were already retried.
      return rows.map((row) => ({
        ...row,
        retryable: row.status === 'failed' && (row.retry_count as number) >= retryLimitFor(ctx.executors, row.job_type as string),
      }))
    }),

  /** Re-queue a failed run in place as a fresh attempt (automatic retries reset). */
  retry: publicProcedure
    .input(z.string().max(255))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [row] = await tx`
          UPDATE job_runs
          SET status = 'pending', error = NULL, output = NULL, retry_count = 0,
              run_after = now(), started_at = NULL, completed_at = NULL
          WHERE id = ${input} AND user_id = ${ctx.userId} AND status = 'failed'
          RETURNING id
        `
        if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'No failed job to retry' })
        return { id: row.id as string }
      })
    }),

  runningCount: publicProcedure
    .query(async ({ ctx }) => {
      return withUser(ctx.userId, async (tx) => {
        const [row] = await tx`
          SELECT COUNT(*)::int AS count FROM job_runs
          WHERE user_id = ${ctx.userId} AND status IN ('pending', 'running')
        `
        return row?.count ?? 0
      })
    }),

  forWorkflow: publicProcedure
    .input(z.object({ workflowId: z.string().max(255), limit: z.number().int().optional().default(10) }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT * FROM job_runs
          WHERE user_id = ${ctx.userId} AND workflow_id = ${input.workflowId}
          ORDER BY created_at DESC
          LIMIT ${input.limit}
        `
      })
    }),
})
