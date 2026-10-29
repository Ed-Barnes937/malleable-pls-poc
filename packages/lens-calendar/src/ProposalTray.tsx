import { Sparkles } from 'lucide-react'
import type { ProposalLayer } from './proposals'

/**
 * The calendar-level bar for a proposal layer: how many suggested blocks
 * there are, Accept all, and "Keep my plan" (dismiss all, nothing saved).
 * `label` lets the source say what they are, e.g. "re-fitted blocks".
 */
export function ProposalTray({ layer, label = 'suggested blocks' }: { layer: ProposalLayer; label?: string }) {
  const open = layer.proposals.filter((p) => !layer.savedIds.has(p.id)).length
  if (layer.proposals.length === 0) return null
  return (
    <div
      role="region"
      aria-label="Suggested blocks"
      data-testid="proposal-tray"
      className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-item border border-accent-line bg-accent-soft px-3.5 py-2"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-accent" />
      <span className="text-body text-text-primary">
        {open} {open === 1 ? label.replace(/s$/, '') : label} - drag to adjust, nothing is saved until you accept.
      </span>
      {layer.error && <span role="status" className="text-meta text-text-secondary">{layer.error}</span>}
      <div className="ml-auto flex gap-1.5">
        <button
          type="button"
          onClick={() => void layer.acceptAll()}
          disabled={layer.saving || open === 0}
          className="inline-flex h-8 items-center rounded-item bg-accent px-3 text-body font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={layer.dismissAll}
          disabled={layer.saving}
          className="inline-flex h-8 items-center rounded-item border border-border bg-surface-raised px-3 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
        >
          Keep my plan
        </button>
      </div>
    </div>
  )
}
