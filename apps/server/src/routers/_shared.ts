import { z } from 'zod'
import type { TxSql } from '@pls/db'

/**
 * Courses a student can file things under. Mirrors `COURSES` in
 * `packages/shared-ui/src/constants.ts`.
 */
export const COURSE_LABELS = ['biology', 'chemistry', 'physics']

export const courseTag = z.string().max(500).optional()

/** Board scope accepted by list endpoints: a focused recording and/or a course. */
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
