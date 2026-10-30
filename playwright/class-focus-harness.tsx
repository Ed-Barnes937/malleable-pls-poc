import { useState } from 'react'
import { splitScope, type LectureBoardRef } from '@pls/lens-framework'
import { decodeScope, trpc } from '@pls/substrate-client'
import CalendarLens, { manifest as calendar } from '@pls/lens-calendar'
import { useFocusClass } from '../packages/workspace-shell/src/class-focus'
import { TestProviders } from './mount-wrapper'

/**
 * The Calendar on a board, scoped the way the shell scopes it (from the
 * board's stored scope, split by the Calendar's declaration), with the
 * shell's own `onFocusClass` (`useFocusClass`, against the simulator). The
 * other board facts are props: `lectureBoards`, `boardShowsLectures`, and
 * what "Also open in" answers (`openResult`). Shows the board scope as text
 * ("course / lecture"), and lists every class focus, board open and
 * "Add a widget" in `class-calls`.
 */
export function ClassFocusHarness({
  boardId = 'ws-exam-prep',
  lectureBoards = [],
  boardShowsLectures = false,
  openResult = 'opened',
  width = 1000,
  height = 640,
}: {
  boardId?: string
  lectureBoards?: LectureBoardRef[]
  boardShowsLectures?: boolean
  openResult?: 'opened' | 'failed' | 'gone'
  width?: number | string
  height?: number
}) {
  return (
    <TestProviders boardId={boardId}>
      <Board
        boardId={boardId}
        lectureBoards={lectureBoards}
        boardShowsLectures={boardShowsLectures}
        openResult={openResult}
        width={width}
        height={height}
      />
    </TestProviders>
  )
}

function Board({ boardId, lectureBoards, boardShowsLectures, openResult, width, height }: {
  boardId: string
  lectureBoards: LectureBoardRef[]
  boardShowsLectures: boolean
  openResult: 'opened' | 'failed' | 'gone'
  width: number | string
  height: number
}) {
  const { data: rows } = trpc.workspaces.scopes.useQuery(boardId)
  const focusClass = useFocusClass(boardId)
  const [calls, setCalls] = useState<string[]>([])
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
          lectureBoards={lectureBoards}
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
