import { z } from 'zod'
import { withUser, type TxSql } from '@pls/db'
import { DEFAULT_REVIEW_TIME_ZONE, defaultLectureTitle, timeZoneInput, type BoardScope, type Lecture } from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { getPreferences, placementTimeZone } from '../preferences/store'
import { andInCourse, courseKey, recordingProcessing, requireOwnLecture } from './_shared'
import { lockBoardScope, readBoardScope, writeBoardScope } from './_board-scope'
import { classLectureForCapture, findOrCreateClassLecture } from './_class-lectures'

const lectureId = z.string().max(255)
const lectureTitle = z.string().trim().min(1).max(500)
const boardId = z.string().max(255)
const localDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

/** The zone dates and default titles are read in: the student's preference, else the browser's. */
async function studentTimeZone(tx: TxSql, userId: string, browserZone: string | undefined): Promise<string> {
  return placementTimeZone(await getPreferences(tx, userId), browserZone ?? DEFAULT_REVIEW_TIME_ZONE)
}

/** What `forClassOccurrence` returns. */
export interface ClassOccurrenceLecture {
  lecture: Lecture
  /** This call made the lecture (the occurrence had none). */
  created: boolean
  /**
   * With `workspaceId`: the board's scope before and after the write, in
   * that transaction (e.g. to offer Undo with `setBoardScope(before)`, and
   * only when they differ). Null without a board.
   */
  board: { before: BoardScope; after: BoardScope } | null
}

/**
 * Lectures as `Lecture` rows, with their recordings oldest first (each with
 * `processing`, as `recordings.byId`). `where` is
 * the rest of the WHERE clause after the user check, e.g. tx`AND l.id = ...`.
 */
function selectLectures(tx: TxSql, userId: string, where: ReturnType<TxSql['unsafe']>) {
  return tx<Lecture[]>`
    SELECT
      l.id, l.title, l.course, l.starts_at, l.class_item_id,
      -- As YYYY-MM-DD, as the client compares it, not a Date at UTC midnight.
      l.class_date::text AS class_date, l.created_at, l.updated_at,
      COALESCE(recs.list, '[]'::json) AS recordings
    FROM lectures l
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'id', r.id, 'title', r.title, 'status', r.status, 'duration', r.duration, 'created_at', r.created_at,
          'processing', ${recordingProcessing(tx, userId, tx`r.id`)}
        )
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
   * A new lecture, e.g. from a widget before any audio exists (Record makes
   * one when capture starts). Named from its course and start time in the
   * student's zone unless `title` is given. With `workspaceId` it is also
   * selected on that board, in the same transaction, bringing its course
   * with it (see `writeBoardScope`).
   *
   * With `matchClass`, when a class of `course` is on at `startsAt` (see
   * `classForCapture`), it is that class occurrence's lecture instead, found
   * or made exactly as `forClassOccurrence` does (so "press Record during
   * Biology" and "open Tuesday's Biology class" land on one lecture), and
   * `title` is not used.
   */
  create: publicProcedure
    .input(z.object({
      course: courseKey.nullable(),
      title: lectureTitle.optional(),
      startsAt: z.coerce.date().optional(),
      // The browser's zone, for dates and the default title when the student has set none.
      timeZone: timeZoneInput.optional(),
      workspaceId: boardId.optional(),
      matchClass: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<Lecture> => {
      return withUser(ctx.userId, async (tx) => {
        // The board's scope lock (which checks it is the student's) before the
        // lecture rows, as forClassOccurrence does, so racing captures queue.
        if (input.workspaceId) await lockBoardScope(tx, ctx.userId, input.workspaceId)
        const startsAt = input.startsAt ?? new Date()
        const zone = await studentTimeZone(tx, ctx.userId, input.timeZone)
        let id = input.matchClass
          ? (await classLectureForCapture(tx, ctx.userId, { course: input.course, at: startsAt }, zone))?.id
          : undefined
        if (!id) {
          const title = input.title ?? defaultLectureTitle(input.course, startsAt, zone)
          const [row] = await tx`
            INSERT INTO lectures (user_id, title, course, starts_at)
            VALUES (${ctx.userId}, ${title}, ${input.course}, ${startsAt})
            RETURNING id
          `
          id = row.id as string
        }
        if (input.workspaceId) await writeBoardScope(tx, ctx.userId, input.workspaceId, { lectureId: id })
        return (await lectureById(tx, ctx.userId, id))!
      })
    }),

  /**
   * The lecture of one occurrence of a class (`planItemId` on local `date`,
   * YYYY-MM-DD in the series' zone, else the student's), made on first use:
   * exactly one per occurrence however many callers race. Past, current and
   * future occurrences all work. With `workspaceId` it is also selected on
   * that board in the same transaction (course follows, per
   * `writeBoardScope`), and the board's scope before and after is returned.
   *
   * NOT_FOUND: the plan item or board isn't the student's. BAD_REQUEST: the
   * plan item isn't a class block, or isn't on `date`.
   */
  forClassOccurrence: publicProcedure
    .input(z.object({
      planItemId: z.string().max(255),
      date: localDateInput,
      workspaceId: boardId.optional(),
      // The browser's zone, to date a one-off class when the student has set none.
      timeZone: timeZoneInput.optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<ClassOccurrenceLecture> => {
      return withUser(ctx.userId, async (tx) => {
        // The board lock first, as every scope write takes it before the
        // rows it names, so racing calls queue on it rather than deadlock.
        if (input.workspaceId) await lockBoardScope(tx, ctx.userId, input.workspaceId)
        const zone = await studentTimeZone(tx, ctx.userId, input.timeZone)
        const { id, created } = await findOrCreateClassLecture(tx, ctx.userId, input.planItemId, input.date, zone)
        let board: ClassOccurrenceLecture['board'] = null
        if (input.workspaceId) {
          const before = await readBoardScope(tx, ctx.userId, input.workspaceId)
          const after = await writeBoardScope(tx, ctx.userId, input.workspaceId, { lectureId: id })
          board = { before, after }
        }
        return { lecture: (await lectureById(tx, ctx.userId, id))!, created, board }
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
            const workspaceId = board.workspace_id as string
            // Under the board's scope lock, only if it still has the lecture
            // selected: a scope write since the select above may have
            // cleared it, and that must not bring it back.
            await lockBoardScope(tx, ctx.userId, workspaceId)
            if ((await readBoardScope(tx, ctx.userId, workspaceId)).lectureId !== input.id) continue
            await writeBoardScope(tx, ctx.userId, workspaceId, { lectureId: input.id })
          }
        }
        return (await lectureById(tx, ctx.userId, input.id))!
      })
    }),
})
