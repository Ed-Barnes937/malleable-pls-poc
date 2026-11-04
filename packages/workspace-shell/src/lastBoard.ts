/**
 * The board the student last had open, remembered on this device (decision
 * 5 of the flow audit): a phone and a laptop each reopen where they were
 * left. Keyed per user so two accounts on one browser don't share it. Only
 * an id: whether the student still has the board is `resolveActiveBoard`'s
 * call, so a deleted board falls back to the default.
 */

/** The user this build runs as, as the API client sees it (see apps/web/src/main.tsx). */
const USER_ID: string = import.meta.env?.VITE_USER_ID ?? 'dev-user-1'

export const lastBoardKey = (userId: string) => `pls-last-board:${userId}`

function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The remembered board id, or null: never opened one here, or storage is unavailable. */
export function readLastBoard(userId: string = USER_ID, storage: Storage | null = deviceStorage()): string | null {
  try {
    return storage?.getItem(lastBoardKey(userId)) || null
  } catch {
    return null
  }
}

/** Remembers the open board; null forgets it. Never throws (private windows, blocked site data). */
export function writeLastBoard(
  boardId: string | null,
  userId: string = USER_ID,
  storage: Storage | null = deviceStorage(),
): void {
  try {
    if (boardId) storage?.setItem(lastBoardKey(userId), boardId)
    else storage?.removeItem(lastBoardKey(userId))
  } catch {
    // Remembering is a convenience: the app works without it.
  }
}
