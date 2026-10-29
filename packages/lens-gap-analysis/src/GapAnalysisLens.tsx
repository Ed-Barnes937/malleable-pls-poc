import { type LensProps, useSubstrate } from '@pls/lens-framework'
import { cn, EmptyState, ProgressBar, courseTone } from '@pls/shared-ui'
import { BarChart3, CircleHelp } from 'lucide-react'

export default function GapAnalysisLens({ highlight }: LensProps) {
  const substrate = useSubstrate()
  const { data: gaps } = substrate.useGapAnalysis()

  if (!gaps?.length) {
    return <EmptyState message="No course data available" />
  }

  const sorted = [...gaps].sort((a, b) => a.percentage - b.percentage)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-text-muted" />
        <span className="text-meta font-semibold text-text-muted">How your courses compare</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4">
        {sorted.map((course) => {
          const barColor = courseTone(course.course).stripe
          const toReview = course.reviewMoments > 0
          // Highlight, never hide: the board course stands out, the rest dim.
          const highlighted = highlight?.courseTag === course.course
          const dimmed = Boolean(highlight?.courseTag) && !highlighted
          return (
            <div
              key={course.course}
              data-testid="gap-course-row"
              data-course={course.course}
              data-highlighted={highlighted || undefined}
              aria-current={highlighted || undefined}
              className={cn(
                'flex items-center gap-4 rounded-item px-2 py-1.5 transition-opacity',
                highlighted && 'bg-accent-soft ring-1 ring-accent-line',
                dimmed && 'opacity-60',
              )}
            >
              <span className="w-20 shrink-0 text-right text-body font-semibold capitalize text-text-primary">
                {course.course}
              </span>
              <div className="flex flex-1 items-center gap-3">
                <div
                  className="flex flex-1 items-center gap-2"
                  title={`You feel sure about ${course.solidMoments} of ${course.totalMoments} moments`}
                >
                  <ProgressBar value={course.percentage} color={barColor} size="sm" rounded className="flex-1" />
                  <span className="w-10 shrink-0 text-right text-meta font-semibold tabular-nums text-text-secondary">
                    {course.percentage}%
                  </span>
                </div>
                <span className={cn(
                  'flex w-28 shrink-0 items-center gap-1 text-meta',
                  toReview ? 'font-semibold text-attn' : 'text-text-muted',
                )}>
                  {toReview && <CircleHelp className="h-3.5 w-3.5 shrink-0" />}
                  {toReview ? `${course.reviewMoments} to review` : 'Nothing to review'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
