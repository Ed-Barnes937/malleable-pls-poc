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
 * Board scope accepted by list endpoints: a focused recording and/or a course.
 * A targeted recording wins over the course: when `recordingId` is set the
 * endpoint returns that lecture's data and does not apply `courseTag`, so a
 * lecture focused outside the board course never silently loses the
 * student's own tags and notes.
 */
export const boardScope = z.object({
  recordingId: z.string().max(255).optional(),
  courseTag,
})

/**
 * Targets that carry a course. The course is a `tags` row on the target whose
 * label is the course: lectures as `recording`, plan items as `plan_item`.
 * Anything else (segments, tags, confidence, links) inherits the course of
 * the recording it belongs to.
 */
export type CourseTarget = 'recording' | 'plan_item'

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
 * The one place board course scope is turned into SQL: an `EXISTS (...)`
 * predicate that is true when `target` (identified by the SQL expression
 * `targetId`, e.g. tx`ts.recording_id`) is tagged with `course`.
 */
export function inCourse(
  tx: TxSql,
  userId: string,
  course: string,
  target: CourseTarget,
  targetId: Fragment,
): Fragment {
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
 * A lecture's course as a column (`... AS course`): its first course tag,
 * or NULL when it is filed under none. `recordingId` is the SQL expression
 * for the recording's id, e.g. tx`r.id`.
 */
export function recordingCourse(tx: TxSql, recordingId: Fragment): Fragment {
  return tx`(
    SELECT t.label FROM tags t
    WHERE t.target_type = 'recording' AND t.target_id = ${recordingId}
      AND t.label IN ${tx(COURSE_LABELS)}
    ORDER BY t.created_at, t.id LIMIT 1
  )`
}
