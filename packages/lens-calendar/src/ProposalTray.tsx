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
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl bg-accent/[0.08] px-3 py-1.5 ring-1 ring-accent/20"
    >
      <Sparkles className="h-3.5 w-3.5 text-accent" />
      <span className="text-[11px] font-medium text-text-primary">
        {open} {open === 1 ? label.replace(/s$/, '') : label} - drag to adjust, nothing is saved until you accept.
      </span>
      {layer.error && <span role="status" className="text-[11px] text-text-secondary">{layer.error}</span>}
      <div className="ml-auto flex gap-1.5">
        <button
          type="button"
          onClick={() => void layer.acceptAll()}
          disabled={layer.saving || open === 0}
          className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={layer.dismissAll}
          disabled={layer.saving}
          className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-border-subtle transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
        >
          Keep my plan
        </button>
      </div>
    </div>
  )
}
