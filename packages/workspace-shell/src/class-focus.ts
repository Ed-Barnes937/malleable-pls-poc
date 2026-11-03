import { useCallback, useMemo } from 'react'
import { AudioLines, ChevronLeft } from 'lucide-react'
import type {
  ClassFocusBoard, ClassRef, FocusClassResult, FocusedClassLecture, LectureBoardRef, PanelManifest, UndoFocusClassResult,
} from '@pls/lens-framework'
import { useClassOccurrenceLecture, useRestoreBoardScope, useSetBoardScope, useWorkspaceSummary } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { useToastStore } from './toast'

type ScopeFlags = Pick<PanelManifest, 'id' | 'scope'>

/** A board as `workspaces.summary` lists it. */
export interface BoardContents {
  id: string
  name: string
  lens_types: string[]
}

/**
 * Whether a board with these widgets can show a lecture: one of them works
 * on the selected lecture (`lectureId: 'target'`: Record, Transcript,
 * Connections, Resources). Widgets that only highlight it (Calendar, To-do,
 * Coming up) don't count. Read from the manifests, never stored.
 */
export function isLectureBoard(lensTypes: string[], manifests: ReadonlyArray<ScopeFlags>): boolean {
  return lensTypes.some((type) => manifests.find((m) => m.id === type)?.scope?.lectureId === 'target')
}

/**
 * The student's other boards that can show a lecture, in tab order, by
 * their own names: "Also open in" in a calendar class's popover. Found by
 * what each board contains, so renaming or rebuilding boards never breaks it.
 */
export function lectureBoards(boards: BoardContents[], manifests: ReadonlyArray<ScopeFlags>, activeId: string | null): LectureBoardRef[] {
  return boards
    .filter((b) => b.id !== activeId && isLectureBoard(b.lens_types, manifests))
    .map((b) => ({ id: b.id, name: b.name }))
}

/** "Opened Biology lecture · Tue 28 Oct in In Lecture": the toast after "Also open in". */
export function openedLectureMessage(lectureTitle: string, boardName: string): string {
  return `Opened ${lectureTitle} in ${boardName}`
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * The board facts a calendar class popover offers (`LensProps.lectureBoards`
 * and `boardShowsLectures`), from the cached board summary: board and panel
 * changes refresh it, so the list stays current while a popover is open.
 * `lectureBoards` is undefined until the summary has loaded, so the popover
 * offers neither boards nor "Add a widget" before it knows which.
 */
export function useLectureBoards(activeWorkspaceId: string | null, activeLensTypes: string[], manifests: ReadonlyArray<ScopeFlags>) {
  const { data } = useWorkspaceSummary()
  const summary = useMemo(() => (data ?? []) as BoardContents[], [data])
  const boards = useMemo(
    () => (data ? lectureBoards(summary, manifests, activeWorkspaceId) : undefined),
    [data, summary, manifests, activeWorkspaceId],
  )
  return {
    lectureBoards: boards,
    boardShowsLectures: isLectureBoard(activeLensTypes, manifests),
    summary,
  }
}

/**
 * The shell side of `LensProps.onFocusClass`: find or make the class
 * occurrence's lecture and select it on the open board, in one server call
 * (`lectures.forClassOccurrence`, so the board course becomes the lecture's).
 * Reports the board before and after, for Undo (`useUndoFocusClass`).
 */
export function useFocusClass(activeWorkspaceId: string | null): (cls: ClassRef) => Promise<FocusClassResult> {
  const { mutateAsync: forClassOccurrence } = useClassOccurrenceLecture()
  return useCallback(
    async (cls: ClassRef): Promise<FocusClassResult> => {
      if (!activeWorkspaceId) return { status: 'failed' }
      try {
        const { lecture, board } = await forClassOccurrence({ ...cls, workspaceId: activeWorkspaceId, timeZone: browserZone() })
        if (!board) return { status: 'failed' }
        return {
          status: 'focused',
          lecture: {
            id: lecture.id,
            title: lecture.title,
            recordingCount: lecture.recordings.length,
            durationMs: lecture.recordings.reduce((sum, r) => sum + (r.duration ?? 0), 0),
          },
          board,
        }
      } catch {
        return { status: 'failed' }
      }
    },
    [activeWorkspaceId, forClassOccurrence],
  )
}

/**
 * The shell side of `LensProps.onUndoFocusClass`: puts back what the open
 * board showed before a class focus, only while it still shows what that
 * left (`workspaces.restoreBoardScope`), in order with every other board
 * scope write.
 */
export function useUndoFocusClass(activeWorkspaceId: string | null): (board: ClassFocusBoard) => Promise<UndoFocusClassResult> {
  const { mutateAsync: restoreBoardScope } = useRestoreBoardScope()
  return useCallback(
    async (board: ClassFocusBoard): Promise<UndoFocusClassResult> => {
      if (!activeWorkspaceId) return 'failed'
      try {
        const { restored } = await restoreBoardScope({ workspaceId: activeWorkspaceId, to: board.before, ifBoardShows: board.after })
        return restored ? 'undone' : 'changed'
      } catch {
        return 'failed'
      }
    },
    [activeWorkspaceId, restoreBoardScope],
  )
}

/** Puts keyboard focus on board `boardId`'s tab once it is the open one (after a switch). */
function focusBoardTab(boardId: string) {
  let frames = 0
  const tryFocus = () => {
    const tab = document.querySelector<HTMLElement>(
      `[data-testid="top-bar"] button[data-board-id="${CSS.escape(boardId)}"][aria-current="page"]`,
    )
    if (tab) return tab.focus()
    if (++frames < 60) requestAnimationFrame(tryFocus)
  }
  requestAnimationFrame(tryFocus)
}

/**
 * The shell side of `LensProps.onOpenLectureOn` ("Also open in"): focus the
 * lecture on another board (its course follows), switch to it, move focus
 * there and say so with a toast offering the way back, as a moment opened
 * elsewhere does. Going back returns to the board and leaves both scopes as
 * they are. A board that is gone resolves `gone` (and the board list
 * refreshes); any other failure `failed`. Nothing switches unless the write
 * went through.
 */
export function useOpenLectureOn(
  activeWorkspaceId: string | null,
  boards: BoardContents[],
): (boardId: string, lecture: FocusedClassLecture) => Promise<'opened' | 'failed' | 'gone'> {
  const { mutateAsync: setBoardScope } = useSetBoardScope()
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const pushToast = useToastStore((s) => s.push)
  return useCallback(
    async (boardId: string, lecture: FocusedClassLecture) => {
      try {
        await setBoardScope({ workspaceId: boardId, lectureId: lecture.id })
      } catch (e) {
        return (e as { data?: { code?: string } | null }).data?.code === 'NOT_FOUND' ? 'gone' : 'failed'
      }
      const to = boards.find((b) => b.id === boardId)
      const from = boards.find((b) => b.id === activeWorkspaceId)
      const backTo = activeWorkspaceId
      setActiveWorkspaceId(boardId)
      pushToast({
        message: openedLectureMessage(lecture.title, to?.name ?? 'another board'),
        tone: 'success',
        icon: AudioLines,
        key: 'moment-opened',
        // Stays while the student is on that board, so the way back is there
        // whenever they reach it (keyboard included).
        durationMs: null,
        board: boardId,
        ...(backTo
          ? {
              action: {
                label: from?.name ? `Back to ${from.name}` : 'Back to your board',
                icon: ChevronLeft,
                onClick: () => setActiveWorkspaceId(backTo),
              },
            }
          : {}),
      })
      focusBoardTab(boardId)
      return 'opened'
    },
    [activeWorkspaceId, boards, setBoardScope, setActiveWorkspaceId, pushToast],
  )
}
