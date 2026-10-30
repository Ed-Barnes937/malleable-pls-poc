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

/**
 * Takes the board's scope write lock until the transaction ends, so
 * concurrent scope writes to one board run one after another and each reads
 * the scope the previous one left. Every write to a board's
 * `workspace_scopes` takes it first. Throws NOT_FOUND unless the board is
 * the student's own.
 *
 * FOR NO KEY UPDATE rather than FOR UPDATE: it conflicts with itself but
 * not with the FOR KEY SHARE that `requireOwnBoard` and foreign key checks
 * take, so two transactions that already hold that can both queue for this
 * one without deadlocking.
 */
export async function lockBoardScope(tx: TxSql, userId: string, workspaceId: string): Promise<void> {
  const [board] = await tx`
    SELECT id FROM workspaces WHERE id = ${workspaceId} AND user_id = ${userId} FOR NO KEY UPDATE
  `
  if (!board) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found' })
}

/**
 * Sets the board's row of one scope type to `value` (removes it when null).
 * A board has at most one row per type (`uq_workspace_scopes_dimension`).
 * The caller holds `lockBoardScope`.
 */
export async function replaceScopeRow(
  tx: TxSql,
  userId: string,
  workspaceId: string,
  scopeType: string,
  value: string | null,
): Promise<void> {
  if (value === null) {
    await tx`
      DELETE FROM workspace_scopes
      WHERE workspace_id = ${workspaceId} AND scope_type = ${scopeType} AND user_id = ${userId}
    `
    return
  }
  await tx`
    INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value)
    VALUES (${userId}, ${workspaceId}, ${scopeType}, ${value})
    ON CONFLICT (workspace_id, scope_type) DO UPDATE SET scope_value = EXCLUDED.scope_value
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
 * Takes the board's scope lock (`lockBoardScope`, which also checks the
 * board is the student's own) before it reads the current scope, and checks
 * the lecture (`requireOwnLecture`). Returns the board's scope after the
 * write.
 */
export async function writeBoardScope(
  tx: TxSql,
  userId: string,
  workspaceId: string,
  patch: BoardScopePatch,
): Promise<BoardScope> {
  await lockBoardScope(tx, userId, workspaceId)
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

/** Whether two board scopes are the same course and lecture. */
export function sameBoardScope(a: BoardScope, b: BoardScope): boolean {
  return a.courseTag === b.courseTag && a.lectureId === b.lectureId
}

/**
 * Puts back a board scope remembered from earlier (Undo after a calendar
 * class focused its lecture), only if the board still shows `ifBoardShows`
 * (what the remembered change left): a change made since, elsewhere (the
 * header, another tab or device), is never overwritten. `restored` is false
 * when the board has moved on, and nothing is written.
 *
 * `to` is put back as well as it still can be: its lecture, with the course
 * that lecture now has (it may have been refiled under another one since),
 * or, when that lecture is gone, just its course.
 */
export async function restoreBoardScope(
  tx: TxSql,
  userId: string,
  workspaceId: string,
  to: BoardScope,
  ifBoardShows: BoardScope,
): Promise<{ restored: boolean; scope: BoardScope }> {
  await lockBoardScope(tx, userId, workspaceId)
  const current = await readBoardScope(tx, userId, workspaceId)
  if (!sameBoardScope(current, ifBoardShows)) return { restored: false, scope: current }
  const [lecture] = to.lectureId
    ? await tx`SELECT 1 FROM lectures WHERE id = ${to.lectureId} AND user_id = ${userId}`
    : []
  const patch: BoardScopePatch = lecture ? { lectureId: to.lectureId } : { courseTag: to.courseTag, lectureId: null }
  return { restored: true, scope: await writeBoardScope(tx, userId, workspaceId, patch) }
}
