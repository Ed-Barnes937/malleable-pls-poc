import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { TxSql } from '@pls/db'

/**
 * Courses a student can file things under. Mirrors `COURSES` in
 * `packages/shared-ui/src/constants.ts`.
 */
export const COURSE_LABELS = ['biology', 'chemistry', 'physics']

export const courseTag = z.string().max(500).optional()

/**
 * Scope accepted by list endpoints: the board's course and selected lecture,
 * and optionally one recording (not a board dimension: e.g. the recording a
 * study block came from). Every dimension given is applied. A board's
 * lecture is always in its course (see `writeBoardScope`), so course and
 * lecture never disagree; applying both is defence in depth.
 */
export const boardScope = z.object({
  courseTag,
  lectureId: z.string().max(255).optional(),
  recordingId: z.string().max(255).optional(),
})

/**
 * Targets that carry a course. A lecture holds its course as a column
 * (`lectures.course`) and a recording's course is its lecture's; a plan item
 * carries its course as a `tags` row (`target_type = 'plan_item'`) whose
 * label is the course. Anything else (segments, tags, confidence, links)
 * inherits the course of the recording it belongs to.
 */
export type CourseTarget = 'lecture' | 'recording' | 'plan_item'

/** True for a course key the API accepts. */
export function isCourse(course: string): boolean {
  return COURSE_LABELS.includes(course)
}

/** A course key from COURSE_LABELS. */
export const courseKey = z.string().max(100).refine(isCourse, { message: 'Unknown course' })

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
 * Checks that `lectureId` is one of the student's lectures before a write
 * that names it, and holds it until the transaction ends. Throws NOT_FOUND
 * otherwise, for the same reason as `requireOwnBoard`: foreign keys skip
 * row-level security, so without it a recording or a board could point at
 * another student's lecture.
 */
export async function requireOwnLecture(
  tx: TxSql,
  userId: string,
  lectureId: string,
): Promise<{ id: string; course: string | null }> {
  const [lecture] = await tx`
    SELECT id, course FROM lectures WHERE id = ${lectureId} AND user_id = ${userId} FOR KEY SHARE
  `
  if (!lecture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecture not found' })
  return { id: lecture.id as string, course: (lecture.course as string | null) ?? null }
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
      SELECT 1 FROM tags course_tag
      WHERE course_tag.user_id = ${userId}
        AND course_tag.target_type = ${target}
        AND course_tag.target_id = ${targetId}
        AND course_tag.label = ${course}
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
