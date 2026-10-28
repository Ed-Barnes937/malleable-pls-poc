import { RotateCcw } from 'lucide-react'
import { BackgroundPicker } from '@pls/panel-system'

/**
 * The board's background, and a reload. In the top bar's settings popover on
 * wide screens; in the board menu on a phone.
 */
export function BoardAppearance() {
  return (
    <>
      <BackgroundPicker />
      <div className="mt-3 border-t border-border-subtle pt-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-item px-2 py-1 text-meta text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          title="Reload the page"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reload
        </button>
      </div>
    </>
  )
}
