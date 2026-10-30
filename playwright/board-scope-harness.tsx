import { useSetBoardScope } from '@pls/substrate-client'
import { ShellProviders } from './mount-wrapper'
import { BoardScope } from '../packages/workspace-shell/src/BoardScope'
import { ToastHost } from '../packages/workspace-shell/src/toast'

/**
 * The header's scope pills for one board, with the toast host for their
 * errors, and a button that selects `elsewhereLectureId` on the board the
 * way another part of the app does (opening a moment).
 */
export function BoardScopeHarness({ workspaceId, compact = false, elsewhereLectureId }: {
  workspaceId: string
  compact?: boolean
  elsewhereLectureId?: string
}) {
  return (
    <ShellProviders>
      <div style={{ width: compact ? 360 : 900, display: 'flex', padding: 8 }}>
        <BoardScope workspaceId={workspaceId} compact={compact} />
      </div>
      {elsewhereLectureId && <SelectElsewhere workspaceId={workspaceId} lectureId={elsewhereLectureId} />}
      <ToastHost />
    </ShellProviders>
  )
}

function SelectElsewhere({ workspaceId, lectureId }: { workspaceId: string; lectureId: string }) {
  const { mutate } = useSetBoardScope()
  return (
    <button type="button" data-testid="select-elsewhere" onClick={() => mutate({ workspaceId, lectureId })}>
      Select elsewhere
    </button>
  )
}
