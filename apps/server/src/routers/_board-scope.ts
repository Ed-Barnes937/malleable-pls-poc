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
  /**
   * With `lectureId` and no `courseTag`: the board takes the lecture's
   * course even when it is "All courses" (Undo putting back a course board).
   * Read once, with the lecture, so a refile meanwhile can't conflict.
   */
  courseFollowsLecture?: boolean
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
 * caller's transaction and a board with a course never shows a lecture of
 * another one. A board's lecture belongs to the board's course, unless the
 * board is "All courses" (null), which may show any lecture:
 *
 * - I1: on a board with a course, a selected lecture brings its course (a
 *   lecture filed under no course makes it "All courses"). An "All courses"
 *   board keeps "All courses": only the student changes it, through the
 *   course pill. Naming a lecture and a course it is not in, in one patch,
 *   is BAD_REQUEST; naming it with "All courses" is fine.
 * - I2: changing the course clears a lecture that isn't in it. "All
 *   courses" holds every lecture, so changing to it keeps the lecture
 *   (widening loses nothing; the student clears it from its pill).
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
    if (courseTag !== null || patch.courseFollowsLecture) {
      if (patch.courseTag !== undefined && patch.courseTag !== lecture.course) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "A selected lecture's course is the board course" })
      }
      courseTag = lecture.course
    }
  } else if (lectureId) {
    // The lecture stays only while it is in the board course, and always on
    // "All courses". A lecture that is gone (deleted since) never stays. FOR
    // KEY SHARE, as for a selected one: a lecture being deleted is waited
    // for, then found gone, so this never writes back a selection
    // `lectures.delete` has just removed.
    const [lecture] = await tx`SELECT course FROM lectures WHERE id = ${lectureId} AND user_id = ${userId} FOR KEY SHARE`
    const stays = courseTag === null || ((lecture?.course as string | null | undefined) ?? null) === courseTag
    if (!lecture || !stays) lectureId = null
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
 * `to` is put back as well as it still can be: its lecture, under "All
 * courses" when `to` was, else with the course that lecture now has (it may
 * have been refiled under another one since), or, when that lecture is gone,
 * just its course.
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
  // "All courses" is named, and a course follows the lecture (whatever the
  // board shows now), so an "All courses" board goes back to a course (or a
  // course board back to "All courses") exactly.
  const patch: BoardScopePatch = !lecture
    ? { courseTag: to.courseTag, lectureId: null }
    : to.courseTag === null
      ? { courseTag: null, lectureId: to.lectureId }
      : { lectureId: to.lectureId, courseFollowsLecture: true }
  return { restored: true, scope: await writeBoardScope(tx, userId, workspaceId, patch) }
}
