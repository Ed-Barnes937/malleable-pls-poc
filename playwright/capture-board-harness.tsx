import type { Scope } from '@pls/lens-framework'
import { boardScopePatch, decodeScope, trpc } from '@pls/substrate-client'
import AudioCaptureLens from '@pls/lens-audio-capture'
import TranscriptLens from '@pls/lens-transcript'
import { TestProviders } from './mount-wrapper'

/**
 * Record and Transcript on one board, scoped the way the shell scopes them:
 * from the board's stored scope (`workspaces.scopes`), written back with one
 * `setBoardScope` per change. Shows the scope as text for the test to read,
 * and can clear the board's lecture as the header would.
 */
export function CaptureBoardHarness({ boardId = 'ws-in-lecture' }: { boardId?: string }) {
  return (
    <TestProviders boardId={boardId}>
      <Board boardId={boardId} />
    </TestProviders>
  )
}

function Board({ boardId }: { boardId: string }) {
  const { data: rows } = trpc.workspaces.scopes.useQuery(boardId)
  const utils = trpc.useUtils()
  const setBoardScope = trpc.workspaces.setBoardScope.useMutation({
    onSuccess: () => utils.workspaces.scopes.invalidate(boardId),
  })
  if (!rows) return null
  const scope = decodeScope(rows as unknown as { scope_type: string; scope_value: string }[])
  const onScopeChange = async (patch: Partial<Scope>) => {
    try {
      await setBoardScope.mutateAsync({ workspaceId: boardId, ...boardScopePatch(patch) })
      return true
    } catch {
      return false
    }
  }
  return (
    <div className="flex flex-col gap-3 bg-surface p-3">
      <p data-testid="board-scope">{`${scope.courseTag ?? 'all courses'} / ${scope.lectureId ?? 'no lecture'}`}</p>
      {/* As the header's lecture picker would, from anywhere else on the board. */}
      <button type="button" onClick={() => void onScopeChange({ lectureId: undefined })}>Clear the board lecture</button>
      <div data-testid="record" style={{ width: 400, height: 300, containerType: 'size' }}>
        <AudioCaptureLens panelId="record" scope={scope} config={{}} onScopeChange={onScopeChange} />
      </div>
      <div data-testid="transcript" style={{ width: 400, height: 360 }} className="flex flex-col">
        <TranscriptLens panelId="transcript" scope={scope} config={{}} onScopeChange={onScopeChange} />
      </div>
    </div>
  )
}
