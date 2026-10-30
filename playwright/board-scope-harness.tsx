import { ShellProviders } from './mount-wrapper'
import { BoardScope } from '../packages/workspace-shell/src/BoardScope'
import { ToastHost } from '../packages/workspace-shell/src/toast'

/** The header's scope pills for one board, with the toast host for their errors. */
export function BoardScopeHarness({ workspaceId, compact = false }: { workspaceId: string; compact?: boolean }) {
  return (
    <ShellProviders>
      <div style={{ width: compact ? 360 : 900, display: 'flex', padding: 8 }}>
        <BoardScope workspaceId={workspaceId} compact={compact} />
      </div>
      <ToastHost />
    </ShellProviders>
  )
}
