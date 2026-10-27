import type { DateRange } from '@pls/lens-framework'
import type { PlanItemOccurrence } from '@pls/substrate'
import { Sparkles } from 'lucide-react'

/**
 * Extension point for "Help me plan" (plan ticket T9), rendered in the week
 * view header. The calendar hands it the week being shown and its rows; T9
 * replaces this placeholder with the planning side panel (unscheduled to-dos,
 * free time and capacity, Auto-fill ghost blocks) and is free to change the
 * props it needs.
 */
export interface HelpMePlanProps {
  /** The week shown, Monday 00:00 to the next Monday (local). */
  week: DateRange
  /** Every plan item row in that week, other courses included. */
  items: PlanItemOccurrence[]
}

export function HelpMePlan(_props: HelpMePlanProps) {
  return (
    <button
      type="button"
      disabled
      title="Help me plan is coming soon"
      aria-label="Help me plan (coming soon)"
      data-testid="help-me-plan"
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent ring-1 ring-accent/25 transition-colors hover:bg-accent/18 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Sparkles className="h-3 w-3" />
      Help me plan
    </button>
  )
}
