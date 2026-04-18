import { useWeeklyOverview } from '@pls/substrate'
import { type LensProps } from '@pls/workspace-shell'
import { cn } from '@pls/shared-ui'
import { AlertTriangle, TrendingUp } from 'lucide-react'

const COURSE_COLORS: Record<string, string> = {
  biology: 'bg-emerald-500',
  chemistry: 'bg-accent',
  physics: 'bg-tag-key-point',
}

export default function WeeklyOverviewLens({ scope }: LensProps) {
  const { data: overview } = useWeeklyOverview(scope)

  if (!overview?.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-600">
        No data for this period
      </div>
    )
  }

  const totalGaps = overview.reduce((sum, c) => sum + c.gapCount, 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">This Week</span>
        {totalGaps > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-tag-confused/10 px-2 py-0.5 text-[10px] font-medium text-tag-confused ring-1 ring-tag-confused/20">
            <AlertTriangle className="h-2.5 w-2.5" />
            {totalGaps} gap{totalGaps !== 1 ? 's' : ''} to review
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-5">
        {overview.map((course) => {
          const barColor = COURSE_COLORS[course.course] ?? 'bg-neutral-500'
          return (
            <div key={course.course} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium capitalize text-neutral-300">{course.course}</span>
                <div className="flex items-center gap-2">
                  {course.gapCount > 0 && (
                    <span className="text-[10px] text-tag-confused">
                      {course.gapCount} gap{course.gapCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="font-mono text-xs tabular-nums text-neutral-500">{course.percentage}%</span>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-neutral-800">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', barColor)}
                  style={{ width: `${course.percentage}%`, opacity: 0.7 }}
                />
              </div>
              <div className="flex items-center gap-1 text-[10px] text-neutral-600">
                <TrendingUp className="h-2.5 w-2.5" />
                {course.confidentSegments} of {course.totalSegments} segments confident
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
