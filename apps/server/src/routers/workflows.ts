import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { dispatchWorkflows } from '../workflows/dispatch'
import { insertWorkflowJob, workflowJobsJson } from '../workflows/sql'

const jobInputSchema = z.object({
  jobType: z.string().max(255),
  params: z.record(z.unknown()).optional(),
  sortOrder: z.number().int(),
  delayMs: z.number().int().min(0).optional(),
})

export const workflowsRouter = router({
  forLens: publicProcedure
    .input(z.object({ lensType: z.string().max(255), workspaceId: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const workflows = await tx`
          SELECT w.*, ${workflowJobsJson(tx)} AS jobs
          FROM workflows w
          LEFT JOIN workflow_jobs wj ON wj.workflow_id = w.id
          WHERE w.source_lens = ${input.lensType}
            AND w.user_id = ${ctx.userId}
            AND (w.workspace_id IS NULL OR w.workspace_id = ${input.workspaceId})
          GROUP BY w.id
          ORDER BY w.created_at
        `
        return workflows
      })
    }),

  forWorkspace: publicProcedure
    .input(z.object({ workspaceId: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const workflows = await tx`
          SELECT w.*, ${workflowJobsJson(tx)} AS jobs
          FROM workflows w
          LEFT JOIN workflow_jobs wj ON wj.workflow_id = w.id
          WHERE w.user_id = ${ctx.userId}
            AND (w.workspace_id IS NULL OR w.workspace_id = ${input.workspaceId})
          GROUP BY w.id
          ORDER BY w.created_at
        `
        return workflows
      })
    }),

  toggle: publicProcedure
    .input(z.object({ workflowId: z.string().max(255), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        await tx`
          UPDATE workflows SET enabled = ${input.enabled}
          WHERE id = ${input.workflowId} AND user_id = ${ctx.userId}
        `
      })
    }),

  createOverride: publicProcedure
    .input(z.object({
      sourceWorkflowId: z.string().max(255),
      workspaceId: z.string().max(255),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [source] = await tx`
          SELECT * FROM workflows WHERE id = ${input.sourceWorkflowId} AND user_id = ${ctx.userId}
        `
        if (!source) return null
        const [override] = await tx`
          INSERT INTO workflows (user_id, source_lens, trigger_event, condition_field, condition_value, enabled, workspace_id)
          VALUES (${ctx.userId}, ${source.source_lens}, ${source.trigger_event},
                  ${source.condition_field}, ${source.condition_value}, ${input.enabled}, ${input.workspaceId})
          RETURNING *
        `
        const jobs = await tx`SELECT * FROM workflow_jobs WHERE workflow_id = ${input.sourceWorkflowId}`
        for (const job of jobs) {
          await insertWorkflowJob(tx, ctx.userId, override.id, {
            jobType: job.job_type,
            params: job.params,
            sortOrder: job.sort_order,
            delayMs: job.delay_ms,
          })
        }
        return override
      })
    }),

  create: publicProcedure
    .input(z.object({
      workspaceId: z.string().max(255).nullable(),
      sourceLens: z.string().max(255),
      triggerEvent: z.string().max(255),
      conditionField: z.string().max(255).nullable().optional(),
      conditionValue: z.string().max(255).nullable().optional(),
      enabled: z.boolean().default(true),
      jobs: z.array(jobInputSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [workflow] = await tx`
          INSERT INTO workflows (user_id, source_lens, trigger_event, condition_field, condition_value, enabled, workspace_id)
          VALUES (${ctx.userId}, ${input.sourceLens}, ${input.triggerEvent},
                  ${input.conditionField ?? null}, ${input.conditionValue ?? null}, ${input.enabled}, ${input.workspaceId})
          RETURNING *
        `
        for (const job of input.jobs) {
          await insertWorkflowJob(tx, ctx.userId, workflow.id, job)
        }
        return workflow
      })
    }),

  update: publicProcedure
    .input(z.object({
      workflowId: z.string().max(255),
      triggerEvent: z.string().max(255),
      conditionField: z.string().max(255).nullable().optional(),
      conditionValue: z.string().max(255).nullable().optional(),
      enabled: z.boolean(),
      jobs: z.array(jobInputSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [workflow] = await tx`
          UPDATE workflows SET
            trigger_event = ${input.triggerEvent},
            condition_field = ${input.conditionField ?? null},
            condition_value = ${input.conditionValue ?? null},
            enabled = ${input.enabled}
          WHERE id = ${input.workflowId} AND user_id = ${ctx.userId}
          RETURNING *
        `
        if (!workflow) return null
        await tx`DELETE FROM workflow_jobs WHERE workflow_id = ${input.workflowId} AND user_id = ${ctx.userId}`
        for (const job of input.jobs) {
          await insertWorkflowJob(tx, ctx.userId, input.workflowId, job)
        }
        return workflow
      })
    }),

  delete: publicProcedure
    .input(z.object({ workflowId: z.string().max(255) }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        await tx`DELETE FROM workflows WHERE id = ${input.workflowId} AND user_id = ${ctx.userId}`
      })
    }),

  dispatch: publicProcedure
    .input(z.object({
      eventType: z.string().max(255),
      payload: z.record(z.unknown()), // TODO: validate payload shape per event type
      workspaceId: z.string().max(255).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const ids = await dispatchWorkflows(tx, ctx.userId, input.eventType, input.payload, input.workspaceId)
        return { enqueuedJobIds: ids }
      })
    }),
})
