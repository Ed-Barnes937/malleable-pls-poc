import { type LensProps, useSubstrate } from '@pls/lens-framework'
import { EmptyState, HiddenElsewhere, ProgressBar, courseTone } from '@pls/shared-ui'
import { CircleHelp, TrendingUp } from 'lucide-react'

/** "Your progress": how sure you feel about each course's lecture moments, all time. */
export default function WeeklyOverviewLens({ scope }: LensProps) {
  const substrate = useSubstrate()
  const { data: overview } = substrate.useWeeklyOverview(scope)
  // Unfiltered counterpart, only to say what the course filter leaves out.
  const { data: allCourses } = substrate.useWeeklyOverview({})
  const hidden = (
    <HiddenElsewhere scopedCount={overview?.length ?? 0} unscopedCount={allCourses?.length ?? 0} />
  )

  if (!overview?.length) {
    return <EmptyState message="No lectures yet. Record or upload one to see your progress." action={hidden} />
  }

  const totalToReview = overview.reduce((sum, c) => sum + c.reviewMoments, 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2">
        {totalToReview > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-attn-soft px-2.5 py-0.5 text-meta font-semibold text-attn">
            <CircleHelp className="h-3.5 w-3.5" />
            {totalToReview} moment{totalToReview !== 1 ? 's' : ''} to review
          </span>
        )}
        <span className="ml-auto">{hidden}</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-5">
        {overview.map((course) => {
          const barColor = courseTone(course.course).stripe
          return (
            <div key={course.course} data-testid="progress-course" data-course={course.course} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-body font-semibold capitalize text-text-primary">{course.course}</span>
                <div className="flex items-center gap-2">
                  {course.reviewMoments > 0 && (
                    <span className="text-meta font-semibold text-attn">{course.reviewMoments} to review</span>
                  )}
                  <span className="text-meta font-semibold tabular-nums text-text-muted">{course.percentage}%</span>
                </div>
              </div>
              <ProgressBar value={course.percentage} color={barColor} size="sm" rounded />
              <div className="flex items-center gap-1.5 text-meta text-text-muted">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                You feel sure about {course.solidMoments} of {course.totalMoments} moments so far
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
