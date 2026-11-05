import { TRPCError } from '@trpc/server'
import type { TxSql } from '@pls/db'
import type { BoardScope } from '@pls/substrate'
import { requireOwnLecture } from './_shared'

/*
 * Locking protocol for a board's scope rows (`workspace_scopes` 'tag' and
 * 'lecture') and the lectures they name. It keeps I1 (a board with a course
 * shows only a lecture of that course, see `writeBoardScope`) under
 * concurrent scope writes, course changes and deletes, without deadlocks.
 *
 * Each path, with its locks in the order taken:
 *
 * - A scope write (`writeBoardScope`, `restoreBoardScope`, and the
 *   procedures that select a lecture on a board: setBoardScope,
 *   lectures.create and forClassOccurrence with a board, an upload that
 *   selects its lecture): the board (`lockBoardScope`), then the lecture it
 *   selects or keeps FOR SHARE, then the board's lecture row, then its course
 *   row. It writes no scope row before that lecture read.
 * - A course change (`lectures.update`): the lecture FOR NO KEY UPDATE before
 *   anything else, then `refileLectureOnBoards`: the lecture rows naming it
 *   (FOR UPDATE), then those boards' course rows. No board lock.
 * - Deleting a lecture (`lectures.delete`): the lecture FOR UPDATE, its
 *   recordings and derived plan items, then the lecture rows naming it
 *   (DELETE). No board lock.
 * - Deleting a board (`workspaces.delete`): the board (`lockBoardScope`'s
 *   lock), then its scope rows FOR UPDATE, lecture row then course row
 *   (`lockBoardScopeRows`), then the delete, which cascades to those rows.
 *   Without that explicit lock the cascade would reach them in the order
 *   they lie on disk, course row first on boards written before the lecture
 *   row was written first.
 * - A recording or resource written into a lecture (uploads, resources) and
 *   foreign key checks: the lecture FOR KEY SHARE, which conflicts only with
 *   deleting it. An upload that then selects the lecture takes the board and
 *   upgrades to FOR SHARE, which waits only for a course change or delete.
 *
 * A course change to no course (unfiling the lecture) turns a course board
 * showing it into "All courses", as selecting a lecture filed under no
 * course does in `writeBoardScope`; an "All courses" board keeps it.
 *
 * Why I1 holds: FOR SHARE conflicts with NO KEY UPDATE, so a scope write
 * and a course change of the same lecture run one after the other. A write
 * that reads the lecture during a change waits, then reads the committed
 * course; a change waits for writes that already read the lecture to
 * commit, and only then lists the boards showing it, so it refiles every
 * board they made show it, and none can start showing it until it commits.
 *
 * Why no deadlock: the course change and lecture delete never wait for a
 * board lock, and a scope write holds no scope row while it waits for a
 * lecture. A board's rows are always locked lecture row first, then course
 * row, and a scope write or board delete touches only its own board. So a
 * scope write waits for a change only on the lecture, holding the board
 * alone, and a change waits for a scope write only on a scope row, which
 * that write took after its last lecture read: from then on it waits for
 * nothing but its own board's rows, which the change only reaches after the
 * lecture row the write holds. A board delete takes no lecture: it waits
 * for a change or lecture delete only on the board's lecture row, holding no
 * scope row yet, and once it holds that row they wait for it, holding none
 * of that board's rows. Changes and deletes of different lectures share no
 * scope row (a board shows one lecture).
 *
 * A future transaction that changes the course of several lectures (a class
 * moving to another course takes its future lectures with it) must lock all
 * of them FOR NO KEY UPDATE in a fixed order (by id) before it refiles any
 * board. A scope write holds one lecture FOR SHARE and then waits for its
 * board's rows: a change that had already refiled one lecture (holding
 * board rows) and then waited for another lecture that write holds would
 * deadlock with it, as would two such changes taking lectures in different
 * orders.
 */

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
 * `workspace_scopes` takes it first, except a course change or delete of
 * the lecture it shows, which hold that lecture instead (see the protocol
 * above). Throws NOT_FOUND unless the board is the student's own.
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
 * Locks the board's scope rows FOR UPDATE in the protocol's order, lecture
 * row then course row ('lecture' sorts before 'tag'), for a statement that
 * would otherwise reach them in an order of its own (a cascade from deleting
 * the board). The caller holds `lockBoardScope`.
 */
export async function lockBoardScopeRows(tx: TxSql, userId: string, workspaceId: string): Promise<void> {
  await tx`
    SELECT id FROM workspace_scopes
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    ORDER BY scope_type
    FOR UPDATE
  `
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
 * board is the student's own) before it reads the current scope, and reads
 * the lecture it selects or keeps FOR SHARE (`requireOwnLecture`), so a
 * course change under way is waited for and its course read as committed.
 * Writes the lecture row, then the course row (the protocol above). Returns
 * the board's scope after the write.
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
    const lecture = await requireOwnLecture(tx, userId, patch.lectureId, { lock: 'share' })
    if (courseTag !== null || patch.courseFollowsLecture) {
      if (patch.courseTag !== undefined && patch.courseTag !== lecture.course) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "A selected lecture's course is the board course" })
      }
      courseTag = lecture.course
    }
  } else if (lectureId) {
    // The lecture stays only while it is in the board course, and always on
    // "All courses". A lecture that is gone (deleted since) never stays. FOR
    // SHARE, as for a selected one: a lecture being deleted or refiled is
    // waited for, then found gone or read with its new course, so this
    // never writes back a selection `lectures.delete` has just removed, nor
    // keeps one `lectures.update` has just moved out of the course.
    const [lecture] = await tx`SELECT course FROM lectures WHERE id = ${lectureId} AND user_id = ${userId} FOR SHARE`
    const stays = courseTag === null || ((lecture?.course as string | null | undefined) ?? null) === courseTag
    if (!lecture || !stays) lectureId = null
  }

  // Lecture row first, as `refileLectureOnBoards` locks them.
  await replaceScopeRow(tx, userId, workspaceId, SCOPE_TYPE.lectureId, lectureId)
  await replaceScopeRow(tx, userId, workspaceId, SCOPE_TYPE.courseTag, courseTag)
  return { courseTag, lectureId }
}

/**
 * Refiles a lecture that has just moved to `course` (null: no course) on
 * every board showing it, as `writeBoardScope` selecting it would (I1): a
 * board with a course takes `course`, which makes it "All courses" when
 * `course` is null (as selecting a lecture filed under no course does); an
 * "All courses" board stays "All courses" and only keeps showing it.
 *
 * The caller holds the lecture FOR NO KEY UPDATE (or stronger) and has
 * changed its course in this transaction, and takes no board lock: no scope
 * write can make a board show the lecture until it commits (see the
 * protocol above). Each board's lecture row is locked before its course row,
 * so a scope write that has just moved a board off the lecture is waited
 * for, and that board is then left alone.
 */
export async function refileLectureOnBoards(
  tx: TxSql,
  userId: string,
  lectureId: string,
  course: string | null,
): Promise<void> {
  const showing = await tx`
    SELECT workspace_id FROM workspace_scopes
    WHERE scope_type = ${SCOPE_TYPE.lectureId} AND scope_value = ${lectureId} AND user_id = ${userId}
    ORDER BY workspace_id
    FOR UPDATE
  `
  const boards = showing.map((r) => r.workspace_id as string)
  if (boards.length === 0) return
  if (course === null) {
    await tx`
      DELETE FROM workspace_scopes
      WHERE workspace_id = ANY(${boards}::text[]) AND scope_type = ${SCOPE_TYPE.courseTag} AND user_id = ${userId}
    `
    return
  }
  await tx`
    UPDATE workspace_scopes SET scope_value = ${course}
    WHERE workspace_id = ANY(${boards}::text[]) AND scope_type = ${SCOPE_TYPE.courseTag} AND user_id = ${userId}
  `
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
