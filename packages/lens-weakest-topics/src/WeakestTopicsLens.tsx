import { useWeakestTopics } from '@pls/substrate'
import { type LensProps } from '@pls/lens-framework'
import { cn, EmptyState, COURSE_PILL_COLORS } from '@pls/shared-ui'

export default function WeakestTopicsLens({}: LensProps) {
  const { data: topics } = useWeakestTopics(8)

  if (!topics?.length) {
    return <EmptyState message="No weak topics found" />
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">
        Weakest Topics
      </span>

      <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 space-y-1">
        {topics.map((topic) => {
          const pillStyle = COURSE_PILL_COLORS[topic.course] ?? 'bg-neutral-700/50 text-neutral-500 ring-neutral-700'
          const displayLabel = topic.conceptLabel.length > 45
            ? topic.conceptLabel.slice(0, 45) + '...'
            : topic.conceptLabel

          return (
            <div
              key={`${topic.rank}-${topic.conceptLabel}`}
              className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-overlay/50"
            >
              <span className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold',
                topic.rank <= 3
                  ? 'bg-tag-confused/15 text-tag-confused'
                  : 'bg-neutral-800 text-neutral-600'
              )}>
                {topic.rank}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-neutral-300">{displayLabel}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize ring-1', pillStyle)}>
                    {topic.course}
                  </span>
                  <span className="text-[10px] text-neutral-600">{topic.week}</span>
                </div>
              </div>

              <div className="flex w-16 shrink-0 flex-col items-end gap-0.5">
                <span className={cn(
                  'font-mono text-[11px] font-bold tabular-nums',
                  topic.avgConfidence < 30 ? 'text-tag-confused' : 'text-tag-key-point'
                )}>
                  {Math.round(topic.avgConfidence)}%
                </span>
                <div className="flex h-1 w-full gap-px">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex-1 rounded-sm',
                        i < Math.round(topic.avgConfidence / 20)
                          ? topic.avgConfidence < 30 ? 'bg-tag-confused/60' : 'bg-tag-key-point/50'
                          : 'bg-neutral-800'
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
