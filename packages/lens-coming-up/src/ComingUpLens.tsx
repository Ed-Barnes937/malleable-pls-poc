import { type LensProps, useSubstrate } from '@pls/lens-framework'
import type { PlanItemOccurrence } from '@pls/substrate'
import { COURSES, COURSE_COLORS, HiddenElsewhere, Select, clockTime, cn, dayLabel, isAllDay } from '@pls/shared-ui'
import { comingUpQuery, groupByDay, isFromRecording, lookAheadDays, LOOK_AHEAD_OPTIONS } from './coming-up'

export default function ComingUpLens({ scope, highlight, config, onConfigChange, onScopeChange }: LensProps) {
  const reader = useSubstrate()
  const days = lookAheadDays(config)
  const now = Date.now()

  const { data: items, isLoading } = reader.usePlanItems(comingUpQuery(days, now, scope.courseTag))
  // Unfiltered counterpart, only to say what the course filter leaves out.
  const { data: all } = reader.usePlanItems(comingUpQuery(days, now))
  const groups = groupByDay(items ?? [], now)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {onConfigChange ? (
          <Select
            aria-label="Look ahead"
            wrapperClassName="w-32 shrink-0"
            value={days}
            onChange={(e) => onConfigChange({ lookAheadDays: Number(e.target.value) })}
          >
            {[...new Set([...LOOK_AHEAD_OPTIONS, days])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>Next {d} days</option>
            ))}
          </Select>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">Next {days} days</span>
        )}
        {/* Only once both lists are in, so the hint never flashes a wrong count. */}
        {items && all && (
          <HiddenElsewhere
            scopedCount={items.length}
            unscopedCount={all.length}
            noCourseCount={all.filter((item) => !item.course).length}
            className="text-right"
          />
        )}
      </div>

      {!isLoading && groups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-neutral-600">
          Nothing due in the next {days} days.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.heading} className="flex flex-col gap-1">
              <h3
                className={cn(
                  'text-[10px] font-medium uppercase tracking-widest',
                  group.past ? 'text-amber-200/60' : 'text-neutral-500',
                )}
              >
                {group.heading}
              </h3>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <DeadlineRow
                    key={item.occurrence_key}
                    item={item}
                    showCourse={!scope.courseTag}
                    highlighted={isFromRecording(item, highlight?.recordingId)}
                    now={now}
                    showDay={group.past}
                    onFocusCourse={
                      onScopeChange && item.course && item.course !== scope.courseTag
                        ? () => onScopeChange({ courseTag: item.course! })
                        : undefined
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

interface DeadlineRowProps {
  item: PlanItemOccurrence
  showCourse: boolean
  highlighted: boolean
  now: number
  /** Show the due day instead of the time (rows in the "from earlier" group). */
  showDay: boolean
  /** Focus the board on this deadline's course; omitted when there is nothing to focus. */
  onFocusCourse?: () => void
}

function DeadlineRow({ item, showCourse, highlighted, now, showDay, onFocusCourse }: DeadlineRowProps) {
  // An all-day deadline (local 00:00) shows no time.
  const time = showDay ? dayLabel(item.due_at!, now) : isAllDay(item.due_at!) ? null : clockTime(item.due_at!)
  const courseLabel = COURSES.find((c) => c.value === item.course)?.label ?? item.course
  const body = (
    <>
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', (item.course && COURSE_COLORS[item.course]) || 'bg-neutral-600')}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{item.title}</span>
      {showCourse && courseLabel && <span className="shrink-0 text-[10px] text-neutral-500">{courseLabel}</span>}
      {time && <span className="shrink-0 font-mono text-[10px] tabular-nums text-neutral-500">{time}</span>}
    </>
  )
  const className = cn(
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
    highlighted && 'bg-accent/5 ring-1 ring-accent/30',
  )

  return (
    <li data-testid="coming-up-item" data-course={item.course ?? undefined} data-highlighted={highlighted || undefined}>
      {onFocusCourse ? (
        <button
          type="button"
          onClick={onFocusCourse}
          title={`Show ${courseLabel} on this board`}
          className={cn(className, 'transition-colors hover:bg-neutral-800/40')}
        >
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  )
}
