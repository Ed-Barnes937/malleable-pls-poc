import { z } from 'zod'
import { router, publicProcedure } from '../trpc'

export const workspacesRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      return ctx.withTenant(async (tx) => {
        return tx`SELECT * FROM workspaces WHERE user_id = ${ctx.userId} ORDER BY created_at`
      })
    }),

  panels: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx`
          SELECT * FROM workspace_panels
          WHERE workspace_id = ${input} AND user_id = ${ctx.userId}
          ORDER BY created_at
        `
      })
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const [ws] = await tx`
          INSERT INTO workspaces (user_id, name)
          VALUES (${ctx.userId}, ${input.name})
          RETURNING *
        `
        return ws
      })
    }),

  addPanel: publicProcedure
    .input(z.object({
      workspaceId: z.string(),
      lensType: z.string(),
      slotName: z.string(),
      config: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const [panel] = await tx`
          INSERT INTO workspace_panels (user_id, workspace_id, lens_type, slot_name, config)
          VALUES (${ctx.userId}, ${input.workspaceId}, ${input.lensType}, ${input.slotName}, ${input.config ?? '{}'})
          RETURNING *
        `
        return panel
      })
    }),

  removePanel: publicProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx`DELETE FROM workspace_panels WHERE id = ${input} AND user_id = ${ctx.userId}`
      })
    }),

  delete: publicProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx`DELETE FROM workspaces WHERE id = ${input} AND user_id = ${ctx.userId}`
      })
    }),

  updateLayouts: publicProcedure
    .input(z.object({
      workspaceId: z.string(),
      layouts: z.array(z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        for (const item of input.layouts) {
          await tx`
            UPDATE workspace_panels
            SET grid_x = ${item.x}, grid_y = ${item.y},
                grid_w = ${item.w}, grid_h = ${item.h}
            WHERE id = ${item.id} AND workspace_id = ${input.workspaceId} AND user_id = ${ctx.userId}
          `
        }
      })
    }),

  scopes: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx`
          SELECT * FROM workspace_scopes
          WHERE workspace_id = ${input} AND user_id = ${ctx.userId}
        `
      })
    }),

  setScope: publicProcedure
    .input(z.object({
      workspaceId: z.string(),
      scopeType: z.string(),
      scopeValue: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        if (input.scopeValue === null) {
          await tx`
            DELETE FROM workspace_scopes
            WHERE workspace_id = ${input.workspaceId} AND scope_type = ${input.scopeType} AND user_id = ${ctx.userId}
          `
          return
        }
        await tx`
          DELETE FROM workspace_scopes
          WHERE workspace_id = ${input.workspaceId} AND scope_type = ${input.scopeType} AND user_id = ${ctx.userId}
        `
        await tx`
          INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value)
          VALUES (${ctx.userId}, ${input.workspaceId}, ${input.scopeType}, ${input.scopeValue})
        `
      })
    }),
})
