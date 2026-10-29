import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CreateWorkspaceDialog } from './WorkspaceDialogs'

/**
 * In place of the board when the student has deleted every one: widgets
 * need a board, so the way on is a new board (the same dialog as the "New
 * board" tab button), not the empty-board starters.
 */
export function NoBoards() {
  const [creating, setCreating] = useState(false)
  return (
    <div data-testid="no-boards" className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-3xl flex-col items-center gap-5 px-4 text-center">
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-heading font-semibold text-text-primary">You don&apos;t have any boards.</h2>
          <p className="max-w-[52ch] text-title text-text-secondary">
            Make a board, then pick the widgets you want on it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-body font-medium text-accent-foreground transition-colors hover:bg-accent/90"
        >
          <Plus size={16} aria-hidden />
          New board
        </button>
      </div>
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
