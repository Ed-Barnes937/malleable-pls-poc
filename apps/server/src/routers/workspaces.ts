import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { JSONValue } from 'postgres'
import { router, publicProcedure } from '../trpc'
import { withUser } from '@pls/db'
import type { BoardScope, WorkspaceSummary } from '@pls/substrate'
import { courseKey, requireOwnBoard } from './_shared'
import { replaceScopeRow, writeBoardScope } from './_board-scope'

export const workspacesRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`SELECT * FROM workspaces WHERE user_id = ${ctx.userId} ORDER BY sort_order, created_at, id`
      })
    }),

  /**
   * Every board with the widget types on it (oldest panel first), in tab
   * order, in one query: what "Also open in" and other cross-board choices
   * read, by what a board contains rather than its name.
   */
  summary: publicProcedure
    .query(async ({ ctx }): Promise<WorkspaceSummary[]> => {
      return withUser(ctx.userId, async (tx) => {
        const rows = await tx`
          SELECT w.id, w.name, w.sort_order,
            COALESCE(
              array_agg(p.lens_type ORDER BY p.created_at, p.id) FILTER (WHERE p.id IS NOT NULL),
              '{}'
            ) AS lens_types
          FROM workspaces w
          LEFT JOIN workspace_panels p ON p.workspace_id = w.id AND p.user_id = ${ctx.userId}
          WHERE w.user_id = ${ctx.userId}
          GROUP BY w.id
          ORDER BY w.sort_order, w.created_at, w.id
        `
        return rows.map((r) => ({
          id: r.id as string,
          name: r.name as string,
          sort_order: r.sort_order as number,
          lens_types: r.lens_types as string[],
        }))
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
    .input(z.object({
      name: z.string().max(500).min(1),
      // Optional board course, stored as the board's 'tag' scope.
      courseTag: courseKey.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        const [ws] = await tx`
          INSERT INTO workspaces (user_id, name, sort_order)
          VALUES (${ctx.userId}, ${input.name}, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspaces WHERE user_id = ${ctx.userId}))
          RETURNING *
        `
        // A board no other transaction can see yet, so no scope lock.
        if (input.courseTag) await replaceScopeRow(tx, ctx.userId, ws.id as string, 'tag', input.courseTag)
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
        await requireOwnBoard(tx, ctx.userId, input.workspaceId)
        const [panel] = await tx`
          INSERT INTO workspace_panels (user_id, workspace_id, lens_type, slot_name, config, pos_x, pos_y, width, height, z_index)
          VALUES (
            ${ctx.userId},
            ${input.workspaceId},
            ${input.lensType},
            ${input.slotName},
            ${tx.json((input.config ?? {}) as JSONValue)},
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
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reorder must include exactly all workspace IDs' })
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
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Panel not found' })
        // config is jsonb — the driver always returns it as a parsed object
        const current = existing.config as Record<string, unknown>
        const merged = { ...current, ...input.configPatch }
        await tx`
          UPDATE workspace_panels
          SET config = ${tx.json(merged as JSONValue)}
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
        if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found' })
        return ws
      })
    }),

  /**
   * The board's scope rows: 'tag' (course) and 'lecture' (selected lecture),
   * at most one of each. Read with `decodeScope`; written only through
   * `setBoardScope`.
   */
  scopes: publicProcedure
    .input(z.string().max(255))
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, async (tx) => {
        return tx`
          SELECT id, user_id, workspace_id, scope_type, scope_value FROM workspace_scopes
          WHERE workspace_id = ${input} AND user_id = ${ctx.userId}
          ORDER BY scope_type
        `
      })
    }),

  /**
   * Sets the board's course and/or lecture in one transaction (absent =
   * unchanged, null = clear), enforcing the board scope invariants (see
   * `writeBoardScope`): a selected lecture brings its course, and a course
   * change clears a lecture outside it. Returns the board's scope after.
   */
  setBoardScope: publicProcedure
    .input(z.object({
      workspaceId: z.string().max(255),
      courseTag: courseKey.nullable().optional(),
      lectureId: z.string().max(255).nullable().optional(),
    }))
    .mutation(async ({ ctx, input: { workspaceId, ...patch } }): Promise<BoardScope> => {
      return withUser(ctx.userId, async (tx) => {
        return writeBoardScope(tx, ctx.userId, workspaceId, patch)
      })
    }),
})
