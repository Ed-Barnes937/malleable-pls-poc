import type { LensProps } from '@pls/lens-framework'
import type { PlanItemOccurrence } from '@pls/substrate'
import { COURSE_PILL_COLORS, cn, dayAndTime, dayLabel, formatDuration, stillToDoLabel } from '@pls/shared-ui'
import { CalendarClock, Check, Clock, Hourglass, X } from 'lucide-react'
import { slippedAt } from './todo-items'
import { SourceLink } from './SourceLink'

export interface TodoRowProps {
  item: PlanItemOccurrence
  now: number
  /** Show the course pill (the board has no course, so to-dos are mixed). */
  showCourse: boolean
  /** Linked to the board's focused lecture. */
  highlighted: boolean
  onToggle: () => void
  /** Omitted for done to-dos (untick instead). */
  onDismiss?: () => void
  onScopeChange: LensProps['onScopeChange']
}

export function TodoRow({ item, now, showCourse, highlighted, onToggle, onDismiss, onScopeChange }: TodoRowProps) {
  const done = item.status === 'done'
  const slipped = done ? null : slippedAt(item, now)

  return (
    <li
      data-testid="todo-item"
      data-highlighted={highlighted || undefined}
      className={cn(
        'group flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-800/40',
        highlighted && 'bg-accent/5 ring-1 ring-accent/30',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Not done yet: ${item.title}` : `Done: ${item.title}`}
        title={done ? 'Mark as not done' : 'Mark as done'}
        onClick={onToggle}
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          done
            ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-400'
            : 'border-neutral-600 text-transparent hover:border-emerald-500/60 hover:text-emerald-500/60',
        )}
      >
        <Check className="h-2.5 w-2.5" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('text-xs leading-snug', done ? 'text-neutral-600 line-through' : 'text-neutral-200')}>
          {item.title}
        </span>
        {!done && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500">
            {slipped ? (
              <span className="flex items-center gap-1 text-amber-200/70">
                <Hourglass className="h-2.5 w-2.5" />
                {stillToDoLabel(slipped, now)}
              </span>
            ) : item.starts_at ? (
              <span className="flex items-center gap-1" title="Scheduled">
                <CalendarClock className="h-2.5 w-2.5" />
                {dayAndTime(item.starts_at, now)}
              </span>
            ) : item.due_at ? (
              <span>Due {dayLabel(item.due_at, now)}</span>
            ) : null}
            {item.duration_min != null && (
              <span className="flex items-center gap-1" title="Time estimate">
                <Clock className="h-2.5 w-2.5" />
                {formatDuration(item.duration_min)}
              </span>
            )}
            {showCourse && item.course && (
              <span
                className={cn(
                  'rounded-full px-1.5 capitalize ring-1',
                  COURSE_PILL_COLORS[item.course] ?? 'bg-neutral-800 text-neutral-400 ring-neutral-700',
                )}
              >
                {item.course}
              </span>
            )}
            <SourceLink item={item} onScopeChange={onScopeChange} />
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          aria-label={`Not doing: ${item.title}`}
          title="Not doing this"
          onClick={onDismiss}
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-600 opacity-0 transition-opacity hover:text-neutral-300 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </li>
  )
}
