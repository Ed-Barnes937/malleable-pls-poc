import { cn } from './utils'

/** How many items a course filter leaves out, given scoped and unscoped counts. */
export function hiddenElsewhereCount(scopedCount: number, unscopedCount: number): number {
  return Math.max(0, unscopedCount - scopedCount)
}

export interface HiddenElsewhereProps {
  /** Items shown under the board's course. */
  scopedCount: number
  /** Items there would be with no course filter. */
  unscopedCount: number
  className?: string
}

/**
 * "+N in other courses": a filtered widget never hides silently. Renders
 * nothing when the filter leaves nothing out.
 */
export function HiddenElsewhere({ scopedCount, unscopedCount, className }: HiddenElsewhereProps) {
  const hidden = hiddenElsewhereCount(scopedCount, unscopedCount)
  if (hidden === 0) return null
  return (
    <span data-testid="hidden-elsewhere" className={cn('text-[10px] text-neutral-500', className)}>
      +{hidden} in other courses
    </span>
  )
}
