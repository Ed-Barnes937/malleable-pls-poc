import { TRPCError } from '@trpc/server'
import type { TxSql } from '@pls/db'
import type { BoardScope } from '@pls/substrate'
import { requireOwnLecture } from './_shared'

/**
 * A change to a board's scope: an absent field is unchanged, null clears it
 * ("All courses", no lecture).
 */
export interface BoardScopePatch {
  courseTag?: string | null
  lectureId?: string | null
}

/** `workspace_scopes.scope_type` of each board scope dimension. */
const SCOPE_TYPE = { courseTag: 'tag', lectureId: 'lecture' } as const

/** The board's stored scope. */
export async function readBoardScope(tx: TxSql, userId: string, workspaceId: string): Promise<BoardScope> {
  const rows = await tx`
    SELECT scope_type, scope_value FROM workspace_scopes
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      AND scope_type IN (${SCOPE_TYPE.courseTag}, ${SCOPE_TYPE.lectureId})
  `
  const value = (type: string) => (rows.find((r) => r.scope_type === type)?.scope_value as string | undefined) ?? null
  return { courseTag: value(SCOPE_TYPE.courseTag), lectureId: value(SCOPE_TYPE.lectureId) }
}

/** Replaces the board's row of one scope type with `value` (none when null). */
export async function replaceScopeRow(
  tx: TxSql,
  userId: string,
  workspaceId: string,
  scopeType: string,
  value: string | null,
): Promise<void> {
  await tx`
    DELETE FROM workspace_scopes
    WHERE workspace_id = ${workspaceId} AND scope_type = ${scopeType} AND user_id = ${userId}
  `
  if (value === null) return
  await tx`
    INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value)
    VALUES (${userId}, ${workspaceId}, ${scopeType}, ${value})
  `
}

/**
 * The one write path for a board's course and lecture, so both land in the
 * caller's transaction and the board can never show a lecture under another
 * course:
 *
 * - I1: a selected lecture brings its course (a lecture filed under no
 *   course means "All courses"). Naming a lecture and a different course in
 *   one patch is BAD_REQUEST.
 * - I2: changing the course clears a lecture that isn't in it, including
 *   "All courses" clearing a lecture that has a course (I1 would otherwise
 *   force the course straight back).
 *
 * The caller has already checked the board is the student's own
 * (`requireOwnBoard`); the lecture is checked here (`requireOwnLecture`).
 * Returns the board's scope after the write.
 */
export async function writeBoardScope(
  tx: TxSql,
  userId: string,
  workspaceId: string,
  patch: BoardScopePatch,
): Promise<BoardScope> {
  const current = await readBoardScope(tx, userId, workspaceId)
  let courseTag = patch.courseTag === undefined ? current.courseTag : patch.courseTag
  let lectureId = patch.lectureId === undefined ? current.lectureId : patch.lectureId

  if (patch.lectureId) {
    const lecture = await requireOwnLecture(tx, userId, patch.lectureId)
    if (patch.courseTag !== undefined && patch.courseTag !== lecture.course) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "A selected lecture's course is the board course" })
    }
    courseTag = lecture.course
  } else if (lectureId) {
    // The lecture stays only while it is in the board course. A lecture that
    // is gone (deleted since) never stays.
    const [lecture] = await tx`SELECT course FROM lectures WHERE id = ${lectureId} AND user_id = ${userId}`
    if (!lecture || ((lecture.course as string | null) ?? null) !== courseTag) lectureId = null
  }

  await replaceScopeRow(tx, userId, workspaceId, SCOPE_TYPE.courseTag, courseTag)
  await replaceScopeRow(tx, userId, workspaceId, SCOPE_TYPE.lectureId, lectureId)
  return { courseTag, lectureId }
}
