import { TRPCError } from '@trpc/server'
import type { TxSql } from '@pls/db'
import { withUser } from '@pls/db'
import {
  courseIdInput,
  courseInUseMessage,
  courseUpdateInput,
  duplicateCourseMessage,
  newCourseInput,
  nextCourseColor,
  type Course,
  type CourseColor,
  type CourseUsage,
} from '@pls/substrate'
import { router, publicProcedure } from '../trpc'

/*
 * The student's courses (migration 026). Lectures, resources and plan items
 * reference one by a foreign key on (user_id, course), ON DELETE RESTRICT;
 * board course scopes ('tag' rows of `workspace_scopes`) are kept by this
 * router and `writeBoardScope` (`requireOwnCourse`).
 *
 * Locks: a write filing something under a course holds it FOR KEY SHARE
 * (`requireOwnCourse`, and every foreign key check). Rename, recolour and
 * archive update non-key columns (FOR NO KEY UPDATE), which never wait for
 * those. Delete locks the course FOR UPDATE before it counts what uses it,
 * so a write filing something under it either commits first (and is
 * counted) or waits and then finds it gone.
 */

function toCourse(row: Record<string, unknown>): Course {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as CourseColor,
    archived_at: row.archived_at ? (row.archived_at as Date).toISOString() : null,
  }
}

function conflict(message: string): TRPCError {
  return new TRPCError({ code: 'CONFLICT', message })
}

/** The student's course with this name (case and surrounding spaces ignored), other than `exceptId`. */
async function sameName(tx: TxSql, userId: string, name: string, exceptId: string | null) {
  const [row] = await tx`
    SELECT name, archived_at FROM courses
    WHERE user_id = ${userId} AND lower(btrim(name)) = lower(btrim(${name}))
      ${exceptId ? tx`AND id <> ${exceptId}` : tx``}
  `
  return row ? { name: row.name as string, archived_at: row.archived_at ? String(row.archived_at) : null } : null
}

/**
 * The unique name index caught a create or rename racing another with the
 * same name (the check before it saw neither): CONFLICT, as the check says.
 */
function rethrowDuplicate(err: unknown, name: string): never {
  const pgErr = err as { code?: string; constraint_name?: string }
  if (pgErr.code === '23505' && pgErr.constraint_name === 'uq_courses_user_name') {
    throw conflict(duplicateCourseMessage({ name: name.trim(), archived_at: null }))
  }
  throw err
}

async function usage(tx: TxSql, userId: string, courseId: string): Promise<CourseUsage> {
  const [row] = await tx`
    SELECT
      (SELECT count(*)::int FROM lectures WHERE user_id = ${userId} AND course = ${courseId}) AS lectures,
      (SELECT count(*)::int FROM resources WHERE user_id = ${userId} AND course = ${courseId}) AS resources,
      (SELECT count(*)::int FROM plan_items WHERE user_id = ${userId} AND course = ${courseId}) AS plan_items
  `
  return { lectures: row.lectures as number, resources: row.resources as number, planItems: row.plan_items as number }
}

export const coursesRouter = router({
  /**
   * Every course of the student's, archived ones included (`archived_at`
   * set): readers need their names and colours to draw what they file.
   * Pickers offer only the active ones. By name, then id.
   */
  list: publicProcedure
    .query(async ({ ctx }): Promise<Course[]> => {
      return withUser(ctx.userId, async (tx) => {
        const rows = await tx`
          SELECT id, name, color, archived_at FROM courses WHERE user_id = ${ctx.userId} ORDER BY lower(name), id
        `
        return rows.map(toCourse)
      })
    }),

  /**
   * A new course (a uuid id). The name is trimmed; without a colour it takes
   * the one the student's active courses use least (`nextCourseColor`).
   * CONFLICT for a name the student already has, archived courses included.
   */
  create: publicProcedure
    .input(newCourseInput)
    .mutation(async ({ ctx, input }): Promise<Course> => {
      return withUser(ctx.userId, async (tx) => {
        const existing = await sameName(tx, ctx.userId, input.name, null)
        if (existing) throw conflict(duplicateCourseMessage(existing))
        const color = input.color ?? nextCourseColor((await tx`
          SELECT color, archived_at FROM courses WHERE user_id = ${ctx.userId}
        `).map((r) => ({ color: r.color as CourseColor, archived_at: r.archived_at ? String(r.archived_at) : null })))
        try {
          const [row] = await tx`
            INSERT INTO courses (user_id, name, color) VALUES (${ctx.userId}, ${input.name}, ${color})
            RETURNING id, name, color, archived_at
          `
          return toCourse(row)
        } catch (err) {
          return rethrowDuplicate(err, input.name)
        }
      })
    }),

  /**
   * Renames, recolours, archives (`archived: true`) or restores
   * (`archived: false`) a course. Nothing that files under it changes: it
   * holds the id. NOT_FOUND for a course that isn't the student's; CONFLICT
   * for a name another of their courses has.
   */
  update: publicProcedure
    .input(courseUpdateInput)
    .mutation(async ({ ctx, input }): Promise<Course> => {
      return withUser(ctx.userId, async (tx) => {
        const [current] = await tx`
          SELECT id, archived_at FROM courses WHERE user_id = ${ctx.userId} AND id = ${input.id} FOR NO KEY UPDATE
        `
        if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' })
        if (input.name !== undefined) {
          const existing = await sameName(tx, ctx.userId, input.name, input.id)
          if (existing) throw conflict(duplicateCourseMessage(existing))
        }
        const archivedAt = input.archived === undefined
          ? current.archived_at
          : input.archived ? (current.archived_at ?? new Date()) : null
        try {
          const [row] = await tx`
            UPDATE courses
            SET name = COALESCE(${input.name ?? null}, name), color = COALESCE(${input.color ?? null}, color),
              archived_at = ${archivedAt}, updated_at = now()
            WHERE user_id = ${ctx.userId} AND id = ${input.id}
            RETURNING id, name, color, archived_at
          `
          return toCourse(row)
        } catch (err) {
          return rethrowDuplicate(err, input.name ?? '')
        }
      })
    }),

  /**
   * Deletes a course nothing files under (a typo, say); archive one that is
   * in use. CONFLICT naming what still uses it (lectures, resources, plan
   * items). Boards scoped to it become "All courses" in the same
   * transaction. NOT_FOUND for a course that isn't the student's.
   */
  delete: publicProcedure
    .input(courseIdInput)
    .mutation(async ({ ctx, input }): Promise<{ id: string }> => {
      return withUser(ctx.userId, async (tx) => {
        const [course] = await tx`
          SELECT id, name FROM courses WHERE user_id = ${ctx.userId} AND id = ${input} FOR UPDATE
        `
        if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' })
        const used = await usage(tx, ctx.userId, input)
        if (used.lectures + used.resources + used.planItems > 0) throw conflict(courseInUseMessage(course.name as string, used))
        await tx`
          DELETE FROM workspace_scopes WHERE user_id = ${ctx.userId} AND scope_type = 'tag' AND scope_value = ${input}
        `
        await tx`DELETE FROM courses WHERE user_id = ${ctx.userId} AND id = ${input}`
        return { id: input }
      })
    }),
})
