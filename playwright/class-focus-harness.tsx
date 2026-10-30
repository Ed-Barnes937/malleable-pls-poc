import { useEffect, useState } from 'react'
import { SubstrateProvider, splitScope, type LectureBoardRef, type SubstrateReader } from '@pls/lens-framework'
import { decodeScope, substrateTrpc, trpc, useSetBoardScope } from '@pls/substrate-client'
import CalendarLens, { manifest as calendar } from '@pls/lens-calendar'
import { useFocusClass, useUndoFocusClass } from '../packages/workspace-shell/src/class-focus'
import { TestProviders } from './mount-wrapper'

/**
 * The Calendar on a board, scoped the way the shell scopes it (from the
 * board's stored scope, split by the Calendar's declaration), with the
 * shell's own `onFocusClass` and `onUndoFocusClass` (`useFocusClass`,
 * `useUndoFocusClass`, against the simulator). The other board facts are
 * props: `lectureBoards` (null: not known yet, as while the board summary
 * loads), `boardShowsLectures`, and what "Also open in" answers
 * (`openResult`). `preferencesLoading` holds the student's preferences back
 * from the Calendar, as before they have loaded. Shows the board scope as text
 * ("course / lecture"), and lists every class focus, board open and
 * "Add a widget" in `class-calls`.
 */
/** The substrate with the student's preferences still loading (they are read, never shown). */
const prefsLoading: SubstrateReader = {
  ...substrateTrpc,
  usePreferences() {
    return { ...substrateTrpc.usePreferences(), data: undefined, isLoading: true }
  },
}

export function ClassFocusHarness({
  boardId = 'ws-exam-prep',
  lectureBoards = [],
  boardShowsLectures = false,
  openResult = 'opened',
  preferencesLoading = false,
  width = 1000,
  height = 640,
}: {
  boardId?: string
  lectureBoards?: LectureBoardRef[] | null
  boardShowsLectures?: boolean
  openResult?: 'opened' | 'failed' | 'gone'
  preferencesLoading?: boolean
  width?: number | string
  height?: number
}) {
  return (
    <TestProviders boardId={boardId}>
      <SubstrateProvider reader={preferencesLoading ? prefsLoading : substrateTrpc} writer={substrateTrpc} boardId={boardId}>
        <Board
          boardId={boardId}
          lectureBoards={lectureBoards}
          boardShowsLectures={boardShowsLectures}
          openResult={openResult}
          width={width}
          height={height}
        />
      </SubstrateProvider>
    </TestProviders>
  )
}

function Board({ boardId, lectureBoards, boardShowsLectures, openResult, width, height }: {
  boardId: string
  lectureBoards: LectureBoardRef[] | null
  boardShowsLectures: boolean
  openResult: 'opened' | 'failed' | 'gone'
  width: number | string
  height: number
}) {
  const { data: rows } = trpc.workspaces.scopes.useQuery(boardId)
  const focusClass = useFocusClass(boardId)
  const undoFocusClass = useUndoFocusClass(boardId)
  const [calls, setCalls] = useState<string[]>([])
  // The header (or another tab) changing the board, without a press that would close the popover.
  const { mutate: setBoardScope } = useSetBoardScope()
  useEffect(() => {
    ;(window as unknown as { changeBoardScope: (patch: { courseTag?: string | null; lectureId?: string | null }) => void }).changeBoardScope =
      (patch) => setBoardScope({ workspaceId: boardId, ...patch })
  }, [boardId, setBoardScope])
  const scope = decodeScope((rows ?? []) as unknown as { scope_type: string; scope_value: string }[])
  const split = splitScope(scope, calendar.scope)
  return (
    <>
      <p data-testid="board-scope">{`${scope.courseTag ?? 'all courses'} / ${scope.lectureId ?? 'no lecture'}`}</p>
      <div className="flex flex-col bg-surface p-3" style={{ width, height }}>
        <CalendarLens
          panelId="calendar-test"
          scope={split.scope}
          highlight={split.highlight}
          config={{}}
          onFocusClass={(cls) => {
            setCalls((c) => [...c, `focus ${cls.planItemId}@${cls.date}`])
            return focusClass(cls)
          }}
          onUndoFocusClass={(board) => {
            setCalls((c) => [...c, 'undo'])
            return undoFocusClass(board)
          }}
          lectureBoards={lectureBoards ?? undefined}
          boardShowsLectures={boardShowsLectures}
          onOpenLectureOn={async (id, lecture) => {
            setCalls((c) => [...c, `open ${id}: ${lecture.title}`])
            return openResult
          }}
          onAddWidget={() => setCalls((c) => [...c, 'add a widget'])}
        />
      </div>
      <ul data-testid="class-calls">
        {calls.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </>
  )
}
