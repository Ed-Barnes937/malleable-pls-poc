import { type LensProps, useSubstrate } from '@pls/lens-framework'
import type { PlanItemOccurrence } from '@pls/substrate'
import { COURSES, HiddenElsewhere, Select, clockTime, cn, courseTone, dayLabel, isAllDay } from '@pls/shared-ui'
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
            wrapperClassName="w-40 shrink-0"
            value={days}
            onChange={(e) => onConfigChange({ lookAheadDays: Number(e.target.value) })}
          >
            {[...new Set([...LOOK_AHEAD_OPTIONS, days])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>Next {d} days</option>
            ))}
          </Select>
        ) : (
          <span className="text-meta font-semibold text-text-muted">Next {days} days</span>
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
        <div className="flex flex-1 items-center justify-center text-body text-text-muted">
          Nothing due in the next {days} days.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.heading} className="flex flex-col gap-1.5">
              <h3
                className={cn(
                  'text-meta font-semibold',
                  group.past ? 'text-attn' : 'text-text-muted',
                )}
              >
                {group.heading}
              </h3>
              <ul className="flex flex-col gap-1.5">
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
        className={cn('h-2 w-2 shrink-0 rounded-full', courseTone(item.course).stripe)}
      />
      <span className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary">{item.title}</span>
      {showCourse && courseLabel && <span className="shrink-0 text-meta text-text-muted">{courseLabel}</span>}
      {time && <span className="shrink-0 text-meta tabular-nums text-text-muted">{time}</span>}
    </>
  )
  const className = cn(
    'flex w-full items-center gap-2.5 rounded-item bg-surface-inset px-3 py-2.5 text-left',
    highlighted && 'bg-accent-soft ring-1 ring-accent-line',
  )

  return (
    <li data-testid="coming-up-item" data-course={item.course ?? undefined} data-highlighted={highlighted || undefined}>
      {onFocusCourse ? (
        <button
          type="button"
          onClick={onFocusCourse}
          title={`Show ${courseLabel} on this board`}
          className={cn(className, 'transition-colors hover:bg-surface-overlay')}
        >
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  )
}
