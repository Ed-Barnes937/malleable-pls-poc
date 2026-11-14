import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { TxSql } from '@pls/db'
import { courseIdInput } from '@pls/substrate'

export const courseTag = z.string().max(500).optional()

/**
 * Scope accepted by list endpoints: the board's course and selected lecture,
 * and optionally one recording (not a board dimension: e.g. the recording a
 * study block came from). Every dimension given is applied. A board's
 * lecture is always in its course when it has one (see `writeBoardScope`;
 * an "All courses" board has none), so course and lecture never disagree;
 * applying both is defence in depth.
 */
export const boardScope = z.object({
  courseTag,
  lectureId: z.string().max(255).optional(),
  recordingId: z.string().max(255).optional(),
})

/**
 * Targets that carry a course. A lecture holds its course as a column
 * (`lectures.course`) and a recording's course is its lecture's; a plan item
 * holds its own (`plan_items.course`, migration 025). A resource is filed under a course (`resources.course`)
 * or a lecture, whose course it takes. Anything else (segments, tags,
 * confidence, links) inherits the course of the recording it belongs to.
 */
export type CourseTarget = 'lecture' | 'recording' | 'plan_item' | 'resource'

/**
 * A course id in an API input (`courses.id`, opaque). Whether it is one of
 * the student's courses is checked in the transaction (`requireOwnCourse`).
 */
export const courseId = courseIdInput

type Fragment = ReturnType<TxSql['unsafe']>

/**
 * Checks that `workspaceId` is one of the student's boards before a write
 * that names it, and holds it until the transaction ends so it can't be
 * deleted under the write. Throws NOT_FOUND otherwise: Postgres checks
 * foreign keys without row-level security, so without this a write naming a
 * deleted board fails with a raw foreign-key error, and one naming another
 * student's board lands in it.
 */
export async function requireOwnBoard(tx: TxSql, userId: string, workspaceId: string): Promise<void> {
  const [board] = await tx`
    SELECT id FROM workspaces WHERE id = ${workspaceId} AND user_id = ${userId} FOR KEY SHARE
  `
  if (!board) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found' })
}

/**
 * Checks that `courseId` is one of the student's courses (archived ones
 * included: hidden from pickers, never forbidden) before a write that files
 * something under it, and holds it until the transaction ends (FOR KEY
 * SHARE) so it can't be deleted under the write. Throws BAD_REQUEST
 * "Unknown course" otherwise. The foreign keys on (user_id, course) are the
 * backstop for lectures, resources and plan items; board course scopes have
 * none, so this is their only check. Returns the course's name.
 */
export async function requireOwnCourse(tx: TxSql, userId: string, courseId: string): Promise<{ id: string; name: string }> {
  const [course] = await tx`
    SELECT id, name FROM courses WHERE user_id = ${userId} AND id = ${courseId} FOR KEY SHARE
  `
  if (!course) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown course' })
  return { id: course.id as string, name: course.name as string }
}

/** A row lock `requireOwnLecture` takes on the lecture. */
export type LectureLock = 'key share' | 'share' | 'no key update' | 'update'

const LECTURE_LOCK: Record<LectureLock, (tx: TxSql) => Fragment> = {
  'key share': (tx) => tx`FOR KEY SHARE`,
  share: (tx) => tx`FOR SHARE`,
  'no key update': (tx) => tx`FOR NO KEY UPDATE`,
  update: (tx) => tx`FOR UPDATE`,
}

/**
 * Checks that `lectureId` is one of the student's lectures before a write
 * that names it, and holds it until the transaction ends. Throws NOT_FOUND
 * otherwise, for the same reason as `requireOwnBoard`: foreign keys skip
 * row-level security, so without it a recording or a board could point at
 * another student's lecture.
 *
 * `lock` is the row lock it takes (see the protocol in `_board-scope.ts`):
 * - 'key share' (the default): the lecture can't be deleted meanwhile, as
 *   for a recording written into it.
 * - 'share': as well, its course can't change meanwhile, and one being
 *   changed is waited for and read as committed (a board selecting it).
 * - 'no key update': changing it (`lectures.update`); waits for every
 *   'share' holder and makes later ones wait.
 * - 'update': deleting it; every write that names it then waits, and finds
 *   it gone.
 */
export async function requireOwnLecture(
  tx: TxSql,
  userId: string,
  lectureId: string,
  { lock = 'key share' }: { lock?: LectureLock } = {},
): Promise<{ id: string; title: string; course: string | null }> {
  const [lecture] = await tx`
    SELECT id, title, course FROM lectures WHERE id = ${lectureId} AND user_id = ${userId} ${LECTURE_LOCK[lock](tx)}
  `
  if (!lecture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecture not found' })
  return { id: lecture.id as string, title: lecture.title as string, course: (lecture.course as string | null) ?? null }
}

/**
 * The one place board course scope is turned into SQL: an `EXISTS (...)`
 * predicate that is true when `target` (identified by the SQL expression
 * `targetId`, e.g. tx`ts.recording_id`) is in `course`.
 */
export function inCourse(
  tx: TxSql,
  userId: string,
  course: string,
  target: CourseTarget,
  targetId: Fragment,
): Fragment {
  if (target === 'lecture') {
    return tx`
      EXISTS (
        SELECT 1 FROM lectures course_lecture
        WHERE course_lecture.user_id = ${userId}
          AND course_lecture.id = ${targetId}
          AND course_lecture.course = ${course}
      )
    `
  }
  if (target === 'resource') {
    return tx`
      EXISTS (
        SELECT 1 FROM resources course_resource
        LEFT JOIN lectures course_lecture
          ON course_lecture.id = course_resource.lecture_id AND course_lecture.user_id = ${userId}
        WHERE course_resource.user_id = ${userId}
          AND course_resource.id = ${targetId}
          AND (course_resource.course = ${course} OR course_lecture.course = ${course})
      )
    `
  }
  if (target === 'recording') {
    return tx`
      EXISTS (
        SELECT 1 FROM recordings course_recording
        JOIN lectures course_lecture ON course_lecture.id = course_recording.lecture_id
        WHERE course_lecture.user_id = ${userId}
          AND course_recording.id = ${targetId}
          AND course_lecture.course = ${course}
      )
    `
  }
  return tx`
    EXISTS (
      SELECT 1 FROM plan_items course_item
      WHERE course_item.user_id = ${userId}
        AND course_item.id = ${targetId}
        AND course_item.course = ${course}
    )
  `
}

/**
 * `AND <inCourse>` when a course is set, otherwise an empty fragment, so a
 * list query applies the board course with one interpolation:
 *
 *   tx`SELECT ts.* FROM transcript_segments ts
 *      WHERE ts.user_id = ${userId}
 *      ${andInCourse(tx, userId, input.courseTag, 'recording', tx`ts.recording_id`)}`
 */
export function andInCourse(
  tx: TxSql,
  userId: string,
  course: string | undefined,
  target: CourseTarget,
  targetId: Fragment,
): Fragment {
  return course ? tx`AND ${inCourse(tx, userId, course, target, targetId)}` : tx``
}

/**
 * `AND <recording is in the lecture>` when a lecture is set, otherwise an
 * empty fragment, the lecture counterpart of `andInCourse`. `recordingId` is
 * the SQL expression for the recording's id, e.g. tx`ts.recording_id`.
 */
export function andInLecture(
  tx: TxSql,
  userId: string,
  lectureId: string | undefined,
  recordingId: Fragment,
): Fragment {
  if (!lectureId) return tx``
  return tx`
    AND ${recordingId} IN (
      SELECT scope_recording.id FROM recordings scope_recording
      WHERE scope_recording.lecture_id = ${lectureId} AND scope_recording.user_id = ${userId}
    )
  `
}

/**
 * Board course, lecture and recording narrowing in one fragment, for readers
 * whose rows belong to a recording (`recordingId` is the SQL expression for
 * it). Empty when the scope sets none of them.
 */
export function andInScope(
  tx: TxSql,
  userId: string,
  scope: z.infer<typeof boardScope>,
  recordingId: Fragment,
): Fragment {
  return tx`
    ${andInCourse(tx, userId, scope.courseTag, 'recording', recordingId)}
    ${andInLecture(tx, userId, scope.lectureId, recordingId)}
    ${scope.recordingId ? tx`AND ${recordingId} = ${scope.recordingId}` : tx``}
  `
}

/** True when the scope narrows by anything (course, lecture or recording). */
export function isScoped(scope: z.infer<typeof boardScope>): boolean {
  return !!(scope.courseTag || scope.lectureId || scope.recordingId)
}

/**
 * What a recording's AI jobs are still doing (`... AS processing`):
 * 'transcribing' first, then 'summarising', NULL when nothing is running.
 * `recordingId` is the SQL expression for the recording's id.
 */
export function recordingProcessing(tx: TxSql, userId: string, recordingId: Fragment): Fragment {
  return tx`(
    SELECT CASE WHEN bool_or(busy.job_type = 'ai:transcribe') THEN 'transcribing' ELSE 'summarising' END
    FROM job_runs busy
    WHERE busy.user_id = ${userId}
      AND busy.status IN ('pending', 'running')
      AND busy.job_type IN ('ai:transcribe', 'ai:summarize-lecture')
      AND COALESCE(busy.input->>'recording_id', busy.input->>'target_id') = ${recordingId}
    HAVING count(*) > 0
  )`
}

/**
 * A recording's course as a column (`... AS course`): its lecture's course,
 * or NULL when that is filed under none. `recordingId` is the SQL expression
 * for the recording's id, e.g. tx`r.id`.
 */
export function recordingCourse(tx: TxSql, recordingId: Fragment): Fragment {
  return tx`(
    SELECT l.course FROM recordings lr
    JOIN lectures l ON l.id = lr.lecture_id
    WHERE lr.id = ${recordingId}
  )`
}
