import type { JSONValue, TransactionSql } from 'postgres'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { parseReviewParams, REVIEW_TASK_JOB, reviewTaskParamsInput } from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import { dispatchWorkflows } from '../workflows/dispatch'
import { insertWorkflowJob, workflowJobsJson } from '../workflows/sql'
import { replaceAutomationReviews, type ReplaceResult } from '../planning/review-automation'

const jobInputSchema = z.object({
  jobType: z.string().max(255),
  params: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int(),
  delayMs: z.number().int().min(0).optional(),
})

/**
 * Ids of the automations that apply on a board: a board copy replaces the
 * built-in one it was made from (same trigger, lens and condition), as in
 * dispatch (see pg-adapter getEffectiveWorkflows), so the list shows one card
 * per automation and its switch reflects what actually runs there.
 */
function effectiveOnBoard(tx: TransactionSql, userId: string, workspaceId: string) {
  return tx`(
    SELECT DISTINCT ON (trigger_event, source_lens, condition_field, condition_value) id
    FROM workflows
    WHERE user_id = ${userId} AND (workspace_id IS NULL OR workspace_id = ${workspaceId})
    ORDER BY trigger_event, source_lens, condition_field, condition_value, workspace_id NULLS LAST, created_at
  )`
}

export const workflowsRouter = router({
  forLens: publicProcedure
    .input(z.object({ lensType: z.string().max(255), workspaceId: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const workflows = await tx`
          SELECT w.*, ${workflowJobsJson(tx)} AS jobs
          FROM workflows w
          LEFT JOIN workflow_jobs wj ON wj.workflow_id = w.id
          WHERE w.id IN ${effectiveOnBoard(tx, ctx.userId, input.workspaceId)}
            AND w.source_lens = ${input.lensType}
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
          WHERE w.id IN ${effectiveOnBoard(tx, ctx.userId, input.workspaceId)}
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
        // The reviews this automation made follow its (possibly new) params.
        const review = input.jobs.find((j) => j.jobType === REVIEW_TASK_JOB)
        if (review) {
          await replaceAutomationReviews(tx, ctx.userId, {
            workflowId: input.workflowId,
            params: parseReviewParams(review.params),
            now: Date.now(),
          })
        }
        return workflow
      })
    }),

  /**
   * Edits an automation in place (default or board-specific): its condition
   * value and/or some jobs' params. Job rows keep their ids, unlike `update`.
   * Editing the confusion automation's params re-places the reviews it made
   * (see replaceAutomationReviews); the result says how many moved.
   */
  patch: publicProcedure
    .input(z.object({
      workflowId: z.string().max(255),
      conditionValue: z.string().max(255).optional(),
      jobParams: z.array(z.object({
        workflowJobId: z.string().max(255),
        params: z.record(z.string(), z.unknown()),
      })).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [workflow] = await tx`
          SELECT id FROM workflows WHERE id = ${input.workflowId} AND user_id = ${ctx.userId}
        `
        if (!workflow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Automation not found' })
        if (input.conditionValue !== undefined) {
          await tx`
            UPDATE workflows SET condition_value = ${input.conditionValue}
            WHERE id = ${input.workflowId} AND user_id = ${ctx.userId}
          `
        }
        const reviews: ReplaceResult = { moved: 0, unscheduled: 0 }
        for (const { workflowJobId, params } of input.jobParams ?? []) {
          const [job] = await tx`
            SELECT job_type FROM workflow_jobs
            WHERE id = ${workflowJobId} AND workflow_id = ${input.workflowId} AND user_id = ${ctx.userId}
          `
          if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Automation step not found' })
          let stored: Record<string, unknown> = params
          if (job.job_type === REVIEW_TASK_JOB) {
            const parsed = reviewTaskParamsInput.safeParse(params)
            if (!parsed.success) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.error.issues.map((i) => i.message).join('; ') })
            }
            stored = parsed.data
          }
          await tx`
            UPDATE workflow_jobs SET params = ${tx.json(stored as JSONValue)}
            WHERE id = ${workflowJobId} AND user_id = ${ctx.userId}
          `
          if (job.job_type === REVIEW_TASK_JOB) {
            const result = await replaceAutomationReviews(tx, ctx.userId, {
              workflowId: input.workflowId,
              params: parseReviewParams(stored),
              now: Date.now(),
            })
            reviews.moved += result.moved
            reviews.unscheduled += result.unscheduled
          }
        }
        return { reviews }
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
      payload: z.record(z.string(), z.unknown()), // TODO: validate payload shape per event type
      workspaceId: z.string().max(255).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const ids = await dispatchWorkflows(tx, ctx.userId, input.eventType, input.payload, input.workspaceId)
        return { enqueuedJobIds: ids }
      })
    }),
})
