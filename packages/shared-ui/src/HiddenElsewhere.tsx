import { cn } from './utils'

/** How many items a course filter leaves out, given scoped and unscoped counts. */
export function hiddenElsewhereCount(scopedCount: number, unscopedCount: number): number {
  return Math.max(0, unscopedCount - scopedCount)
}

/**
 * What a course filter leaves out, split truthfully: items filed under other
 * courses, and items with no course at all (which a course filter also hides).
 * `noCourseCount` is the number of unscoped items with no course.
 */
export function hiddenElsewhereParts(
  scopedCount: number,
  unscopedCount: number,
  noCourseCount = 0,
): { otherCourses: number; noCourse: number } {
  const hidden = hiddenElsewhereCount(scopedCount, unscopedCount)
  const noCourse = Math.min(hidden, Math.max(0, noCourseCount))
  return { otherCourses: hidden - noCourse, noCourse }
}

export interface HiddenElsewhereProps {
  /** Items shown under the board's course. */
  scopedCount: number
  /** Items there would be with no course filter. */
  unscopedCount: number
  /**
   * Of the unscoped items, how many have no course. Pass it where items can
   * be untagged (e.g. plan items), so they are not counted as "in other
   * courses". Omit where every item has a course.
   */
  noCourseCount?: number
  className?: string
}

/**
 * "+N in other courses" (and "M with no course"): a filtered widget never
 * hides silently. Renders nothing when the filter leaves nothing out.
 */
export function HiddenElsewhere({ scopedCount, unscopedCount, noCourseCount, className }: HiddenElsewhereProps) {
  const { otherCourses, noCourse } = hiddenElsewhereParts(scopedCount, unscopedCount, noCourseCount)
  if (otherCourses === 0 && noCourse === 0) return null
  const parts = [
    otherCourses > 0 && `${otherCourses} in other courses`,
    noCourse > 0 && `${noCourse} with no course`,
  ].filter(Boolean)
  return (
    <span data-testid="hidden-elsewhere" className={cn('text-[10px] text-neutral-500', className)}>
      +{parts.join(' · ')}
    </span>
  )
}
