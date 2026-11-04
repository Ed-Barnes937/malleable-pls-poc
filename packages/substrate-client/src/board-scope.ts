import type { BoardScope } from '@pls/substrate'

/** `workspaces.setBoardScope` input less the board: absent = unchanged, null = clear. */
export interface BoardScopePatch {
  courseTag?: string | null
  lectureId?: string | null
}

/**
 * The board scope `setBoardScope` will leave, for an optimistic update, by
 * the server's rules (`writeBoardScope`). A board's lecture belongs to its
 * course, unless the board is "All courses" (null), which may show any:
 *
 * - I1: on a board with a course, a selected lecture brings its course
 *   (`courseOf`, from what the client has cached; `undefined` when it
 *   doesn't know, and then the course is left for the server's answer to
 *   correct). An "All courses" board stays "All courses".
 * - I2: a course change clears the selected lecture unless it is in the new
 *   course (by `courseOf`; unknown: cleared, for the server to correct). A
 *   change to "All courses" keeps it.
 */
export function predictBoardScope(
  current: BoardScope,
  patch: BoardScopePatch,
  courseOf: (lectureId: string) => string | null | undefined,
): BoardScope {
  let courseTag = patch.courseTag === undefined ? current.courseTag : patch.courseTag
  let lectureId = patch.lectureId === undefined ? current.lectureId : patch.lectureId

  if (patch.lectureId) {
    const course = courseOf(patch.lectureId)
    if (courseTag !== null && course !== undefined) courseTag = course
  } else if (lectureId && courseTag !== null && courseTag !== current.courseTag && courseOf(lectureId) !== courseTag) {
    lectureId = null
  }
  return { courseTag, lectureId }
}

/**
 * `patches` (writes not yet answered, oldest first) applied in order over
 * `base`, the scope the server last confirmed: what the board shows meanwhile.
 */
export function applyBoardScopePatches(
  base: BoardScope,
  patches: BoardScopePatch[],
  courseOf: (lectureId: string) => string | null | undefined,
): BoardScope {
  return patches.reduce<BoardScope>((scope, patch) => predictBoardScope(scope, patch, courseOf), base)
}

/** A `workspaces.scopes` row (its id, board and user ride along). */
export type ScopeRow = { scope_type: string; scope_value: string; [column: string]: unknown }

/**
 * A board's cached `workspaces.scopes` rows with its course (`tag`) and
 * lecture rows replaced by `scope`; rows of any other type are kept.
 */
export function withBoardScope(rows: ScopeRow[], workspaceId: string, scope: BoardScope): ScopeRow[] {
  const next = rows.filter((r) => r.scope_type !== 'tag' && r.scope_type !== 'lecture')
  // The row it replaces keeps its id; a new one gets a stand-in until the refetch.
  const row = (scope_type: string, scope_value: string) =>
    ({
      id: `optimistic-${scope_type}`,
      workspace_id: workspaceId,
      ...rows.find((r) => r.scope_type === scope_type),
      scope_type,
      scope_value,
    })
  if (scope.lectureId) next.push(row('lecture', scope.lectureId))
  if (scope.courseTag) next.push(row('tag', scope.courseTag))
  // As the server orders them (by type).
  return next.sort((a, b) => a.scope_type.localeCompare(b.scope_type))
}
