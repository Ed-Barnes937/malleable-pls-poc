import { useGapAnalysis } from '@pls/substrate'
import { type LensProps } from '@pls/workspace-shell'
import { cn } from '@pls/shared-ui'
import { AlertTriangle, BarChart3 } from 'lucide-react'

const COURSE_COLORS: Record<string, string> = {
  biology: 'bg-emerald-500',
  chemistry: 'bg-accent',
  physics: 'bg-tag-key-point',
}

export default function GapAnalysisLens({}: LensProps) {
  const { data: gaps } = useGapAnalysis()

  if (!gaps?.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-600">
        No course data available
      </div>
    )
  }

  const sorted = [...gaps].sort((a, b) => a.percentage - b.percentage)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5 text-neutral-500" />
        <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">Gap Analysis — All Courses</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4">
        {sorted.map((course) => {
          const barColor = COURSE_COLORS[course.course] ?? 'bg-neutral-500'
          const isWeak = course.percentage < 60
          return (
            <div key={course.course} className="flex items-center gap-4">
              <span className="w-20 shrink-0 text-right text-sm font-medium capitalize text-neutral-300">
                {course.course}
              </span>
              <div className="flex flex-1 items-center gap-3">
                <div className="relative flex-1">
                  <div className="h-4 rounded bg-neutral-800">
                    <div
                      className={cn('h-full rounded transition-all duration-500', barColor)}
                      style={{ width: `${course.percentage}%`, opacity: 0.7 }}
                    />
                  </div>
                  <span className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] font-bold tabular-nums',
                    course.percentage > 50 ? 'text-neutral-100' : 'text-neutral-400'
                  )}>
                    {course.percentage}%
                  </span>
                </div>
                <span className={cn(
                  'flex w-28 shrink-0 items-center gap-1 text-[11px]',
                  isWeak ? 'text-tag-confused' : 'text-neutral-500'
                )}>
                  {course.weakAreaCount > 0 && <AlertTriangle className="h-3 w-3" />}
                  {course.weakAreaCount} weak area{course.weakAreaCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
