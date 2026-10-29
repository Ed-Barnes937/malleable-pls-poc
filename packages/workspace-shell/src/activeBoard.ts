import { useEffect } from 'react'
import { useWorkspaces } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'

/**
 * The board to open: the chosen one while the student still has it,
 * otherwise their first board in tab order, or null when they have none.
 * `boards` is the board list in tab order; undefined while it loads, when
 * no board is open yet (so nothing reads or writes a board that may be gone).
 */
export function resolveActiveBoard(
  boards: ReadonlyArray<{ id: string }> | undefined,
  chosenId: string | null,
): string | null {
  if (!boards) return null
  if (chosenId && boards.some((b) => b.id === chosenId)) return chosenId
  return boards[0]?.id ?? null
}

/**
 * The open board: always one of the student's boards (see
 * `resolveActiveBoard`), or null while their boards load or when they have
 * none. Everything that reads or writes "this board" goes through this,
 * never the raw chosen id in the store.
 */
export function useActiveWorkspaceId(): string | null {
  const { data: boards } = useWorkspaces()
  const chosenId = useWorkspaceStore((s) => s.activeWorkspaceId)
  return resolveActiveBoard(boards as { id: string }[] | undefined, chosenId)
}

/**
 * Remembers the board that opened in place of a missing one (first load, a
 * board deleted here or elsewhere), so it stays open when the tabs are
 * reordered. Mounted once, by the shell.
 */
export function useKeepActiveBoard() {
  const { data: boards } = useWorkspaces()
  const chosenId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const resolved = resolveActiveBoard(boards as { id: string }[] | undefined, chosenId)
  useEffect(() => {
    if (boards && resolved !== chosenId) setActiveWorkspaceId(resolved)
  }, [boards, resolved, chosenId, setActiveWorkspaceId])
}
