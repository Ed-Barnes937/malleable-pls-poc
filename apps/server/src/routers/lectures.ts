import { z } from 'zod'
import { withUser, type TxSql } from '@pls/db'
import { DEFAULT_REVIEW_TIME_ZONE, defaultLectureTitle, timeZoneInput, type Lecture } from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { getPreferences, placementTimeZone } from '../preferences/store'
import { andInCourse, courseKey, requireOwnBoard, requireOwnLecture } from './_shared'
import { writeBoardScope } from './_board-scope'

const lectureId = z.string().max(255)
const lectureTitle = z.string().trim().min(1).max(500)

/**
 * Lectures as `Lecture` rows, with their recordings oldest first. `where` is
 * the rest of the WHERE clause after the user check, e.g. tx`AND l.id = ...`.
 */
function selectLectures(tx: TxSql, userId: string, where: ReturnType<TxSql['unsafe']>) {
  return tx<Lecture[]>`
    SELECT
      l.id, l.title, l.course, l.starts_at, l.class_item_id, l.class_date, l.created_at, l.updated_at,
      COALESCE(recs.list, '[]'::json) AS recordings
    FROM lectures l
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object('id', r.id, 'title', r.title, 'status', r.status, 'duration', r.duration, 'created_at', r.created_at)
        ORDER BY r.created_at, r.id
      ) AS list
      FROM recordings r WHERE r.lecture_id = l.id AND r.user_id = ${userId}
    ) recs ON true
    WHERE l.user_id = ${userId} ${where}
    ORDER BY l.starts_at DESC, l.created_at DESC, l.id
  `
}

async function lectureById(tx: TxSql, userId: string, id: string): Promise<Lecture | null> {
  const [lecture] = await selectLectures(tx, userId, tx`AND l.id = ${id}`)
  return lecture ?? null
}

export const lecturesRouter = router({
  /** The student's lectures, latest first, optionally only those in a course. */
  list: publicProcedure
    .input(z.object({ courseTag: courseKey.optional() }).optional())
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, (tx) =>
        selectLectures(tx, ctx.userId, andInCourse(tx, ctx.userId, input?.courseTag, 'lecture', tx`l.id`)),
      )
    }),

  /** One lecture with its recordings, or null if it isn't the student's. */
  byId: publicProcedure
    .input(lectureId)
    .query(async ({ ctx, input }) => {
      return withUser(ctx.userId, (tx) => lectureById(tx, ctx.userId, input))
    }),

  /**
   * A new lecture, e.g. from a widget before any audio exists. Named from
   * its course and start time in the student's zone unless `title` is given.
   * With `workspaceId` it is also selected on that board, in the same
   * transaction, bringing its course with it (see `writeBoardScope`).
   */
  create: publicProcedure
    .input(z.object({
      course: courseKey.nullable(),
      title: lectureTitle.optional(),
      startsAt: z.coerce.date().optional(),
      // The browser's zone, for the default title when the student has set none.
      timeZone: timeZoneInput.optional(),
      workspaceId: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<Lecture> => {
      return withUser(ctx.userId, async (tx) => {
        if (input.workspaceId) await requireOwnBoard(tx, ctx.userId, input.workspaceId)
        const startsAt = input.startsAt ?? new Date()
        let title = input.title
        if (!title) {
          const zone = placementTimeZone(await getPreferences(tx, ctx.userId), input.timeZone ?? DEFAULT_REVIEW_TIME_ZONE)
          title = defaultLectureTitle(input.course, startsAt, zone)
        }
        const [row] = await tx`
          INSERT INTO lectures (user_id, title, course, starts_at)
          VALUES (${ctx.userId}, ${title}, ${input.course}, ${startsAt})
          RETURNING id
        `
        const id = row.id as string
        if (input.workspaceId) await writeBoardScope(tx, ctx.userId, input.workspaceId, { lectureId: id })
        return (await lectureById(tx, ctx.userId, id))!
      })
    }),

  /**
   * Renames a lecture and/or refiles it under another course (null = none).
   * A course change re-scopes every board that has it selected to the new
   * course in the same transaction, so a board's lecture is always in the
   * board course.
   */
  update: publicProcedure
    .input(z.object({
      id: lectureId,
      title: lectureTitle.optional(),
      course: courseKey.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<Lecture> => {
      return withUser(ctx.userId, async (tx) => {
        const before = await requireOwnLecture(tx, ctx.userId, input.id)
        await tx`
          UPDATE lectures SET
            title = COALESCE(${input.title ?? null}, title),
            course = CASE WHEN ${input.course !== undefined} THEN ${input.course ?? null} ELSE course END,
            updated_at = now()
          WHERE id = ${input.id} AND user_id = ${ctx.userId}
        `
        if (input.course !== undefined && input.course !== before.course) {
          const boards = await tx`
            SELECT workspace_id FROM workspace_scopes
            WHERE scope_type = 'lecture' AND scope_value = ${input.id} AND user_id = ${ctx.userId}
          `
          for (const board of boards) {
            await writeBoardScope(tx, ctx.userId, board.workspace_id as string, { lectureId: input.id })
          }
        }
        return (await lectureById(tx, ctx.userId, input.id))!
      })
    }),
})
