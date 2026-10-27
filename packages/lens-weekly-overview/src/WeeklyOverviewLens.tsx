import { type LensProps, useSubstrate } from '@pls/lens-framework'
import { EmptyState, HiddenElsewhere, ProgressBar, COURSE_COLORS } from '@pls/shared-ui'
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
          <span className="flex items-center gap-1 rounded-full bg-tag-confused/10 px-2 py-0.5 text-[10px] font-medium text-tag-confused ring-1 ring-tag-confused/20">
            <CircleHelp className="h-2.5 w-2.5" />
            {totalToReview} moment{totalToReview !== 1 ? 's' : ''} to review
          </span>
        )}
        <span className="ml-auto">{hidden}</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-5">
        {overview.map((course) => {
          const barColor = COURSE_COLORS[course.course] ?? 'bg-neutral-500'
          return (
            <div key={course.course} data-testid="progress-course" data-course={course.course} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium capitalize text-neutral-300">{course.course}</span>
                <div className="flex items-center gap-2">
                  {course.reviewMoments > 0 && (
                    <span className="text-[10px] text-tag-confused">{course.reviewMoments} to review</span>
                  )}
                  <span className="font-mono text-xs tabular-nums text-neutral-500">{course.percentage}%</span>
                </div>
              </div>
              <ProgressBar value={course.percentage} color={barColor} size="sm" rounded />
              <div className="flex items-center gap-1 text-[10px] text-neutral-600">
                <TrendingUp className="h-2.5 w-2.5" />
                You feel sure about {course.solidMoments} of {course.totalMoments} moments so far
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
