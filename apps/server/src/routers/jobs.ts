import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'

export const jobsRouter = router({
  recent: publicProcedure
    .input(z.number().optional().default(5))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT * FROM job_runs
          WHERE user_id = ${ctx.userId}
          ORDER BY created_at DESC
          LIMIT ${input}
        `
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
