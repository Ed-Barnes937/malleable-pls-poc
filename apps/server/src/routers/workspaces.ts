import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'

export const workspacesRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`SELECT * FROM workspaces WHERE user_id = ${ctx.userId} ORDER BY sort_order, created_at, id`
      })
    }),

  panels: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT * FROM workspace_panels
          WHERE workspace_id = ${input} AND user_id = ${ctx.userId}
          ORDER BY created_at
        `
      })
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().max(500).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [ws] = await tx`
          INSERT INTO workspaces (user_id, name, sort_order)
          VALUES (${ctx.userId}, ${input.name}, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspaces WHERE user_id = ${ctx.userId}))
          RETURNING *
        `
        return ws
      })
    }),

  addPanel: publicProcedure
    .input(z.object({
      workspaceId: z.string().max(255),
      lensType: z.string().max(255),
      slotName: z.string().max(255),
      config: z.record(z.string(), z.unknown()).optional(),
      pos_x: z.number().int().optional(),
      pos_y: z.number().int().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      z_index: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [panel] = await tx`
          INSERT INTO workspace_panels (user_id, workspace_id, lens_type, slot_name, config, pos_x, pos_y, width, height, z_index)
          VALUES (
            ${ctx.userId},
            ${input.workspaceId},
            ${input.lensType},
            ${input.slotName},
            ${JSON.stringify(input.config ?? {})},
            ${input.pos_x ?? 0},
            ${input.pos_y ?? 0},
            ${input.width ?? 280},
            ${input.height ?? 220},
            ${input.z_index ?? 0}
          )
          RETURNING *
        `
        return panel
      })
    }),

  removePanel: publicProcedure
    .input(z.string().max(255))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        await tx`DELETE FROM workspace_panels WHERE id = ${input} AND user_id = ${ctx.userId}`
      })
    }),

  delete: publicProcedure
    .input(z.string().max(255))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        await tx`DELETE FROM workspaces WHERE id = ${input} AND user_id = ${ctx.userId}`
      })
    }),

  reorder: publicProcedure
    .input(z.array(z.string().max(255)))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const existing = await tx`SELECT id FROM workspaces WHERE user_id = ${ctx.userId}`
        const existingIds = new Set(existing.map((r) => r.id as string))
        const inputIds = new Set(input)
        if (inputIds.size !== existingIds.size || input.some((id) => !existingIds.has(id))) {
          throw new Error('Reorder must include exactly all workspace IDs')
        }
        for (let i = 0; i < input.length; i++) {
          await tx`UPDATE workspaces SET sort_order = ${i} WHERE id = ${input[i]} AND user_id = ${ctx.userId}`
        }
      })
    }),

  updateLayouts: publicProcedure
    .input(z.array(z.object({
      id: z.string().max(255),
      pos_x: z.number().int(),
      pos_y: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
      z_index: z.number().int(),
    })))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        for (const item of input) {
          await tx`
            UPDATE workspace_panels
            SET pos_x = ${item.pos_x}, pos_y = ${item.pos_y},
                width = ${item.width}, height = ${item.height},
                z_index = ${item.z_index}
            WHERE id = ${item.id} AND user_id = ${ctx.userId}
          `
        }
      })
    }),

  updatePanelConfig: publicProcedure
    .input(z.object({
      panelId: z.string().max(255),
      configPatch: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [existing] = await tx`
          SELECT config FROM workspace_panels
          WHERE id = ${input.panelId} AND user_id = ${ctx.userId}
        `
        if (!existing) throw new Error('Panel not found')
        // config is jsonb — the driver always returns it as a parsed object
        const current = existing.config as Record<string, unknown>
        const merged = { ...current, ...input.configPatch }
        await tx`
          UPDATE workspace_panels
          SET config = ${JSON.stringify(merged)}
          WHERE id = ${input.panelId} AND user_id = ${ctx.userId}
        `
      })
    }),

  updateBackground: publicProcedure
    .input(z.object({
      workspaceId: z.string().max(255),
      backgroundType: z.string().max(255),
      backgroundValue: z.string().max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [ws] = await tx`
          UPDATE workspaces
          SET background_type = ${input.backgroundType},
              background_value = ${input.backgroundValue}
          WHERE id = ${input.workspaceId} AND user_id = ${ctx.userId}
          RETURNING *
        `
        return ws
      })
    }),

  scopes: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT * FROM workspace_scopes
          WHERE workspace_id = ${input} AND user_id = ${ctx.userId}
        `
      })
    }),

  setScope: publicProcedure
    .input(z.object({
      workspaceId: z.string().max(255),
      scopeType: z.string().max(255),
      scopeValue: z.string().max(1000).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        if (input.scopeType === 'tag') {
          await tx`
            DELETE FROM workspace_scopes
            WHERE workspace_id = ${input.workspaceId}
              AND scope_type = 'recording' AND user_id = ${ctx.userId}
          `
        }
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
