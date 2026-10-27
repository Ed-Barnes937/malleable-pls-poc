import type { LensProps } from '@pls/lens-framework'
import type { PlanItemOccurrence } from '@pls/substrate'
import { cn, courseTone, dayAndTime, doByLabel, formatDuration, stillToDoLabel } from '@pls/shared-ui'
import { CalendarClock, Check, Clock, Hourglass, Undo2, X } from 'lucide-react'
import { slippedAt } from './todo-items'
import { SourceLink } from './SourceLink'

export interface TodoRowProps {
  item: PlanItemOccurrence
  now: number
  /** Show the course pill (the board has no course, so to-dos are mixed). */
  showCourse: boolean
  /** Linked to the board's focused lecture. */
  highlighted: boolean
  /** Ticked a moment ago: shown done in place, with "Done · Undo", until it fades. */
  justDone?: { fading: boolean; onUndo: () => void }
  onToggle: () => void
  /** Omitted for done to-dos (untick instead). */
  onDismiss?: () => void
  onScopeChange: LensProps['onScopeChange']
  onShowMoment: LensProps['onShowMoment']
}

export function TodoRow({ item, now, showCourse, highlighted, justDone, onToggle, onDismiss, onScopeChange, onShowMoment }: TodoRowProps) {
  // A just-ticked row is done straight away, before the save comes back.
  const done = item.status === 'done' || !!justDone
  const slipped = done ? null : slippedAt(item, now)

  return (
    <li
      data-testid="todo-item"
      data-highlighted={highlighted || undefined}
      data-just-done={justDone ? (justDone.fading ? 'fading' : 'shown') : undefined}
      className={cn(
        'group flex items-start gap-3 border-b border-border-subtle px-1 py-3 transition-[background-color,opacity] duration-300 last:border-b-0 hover:bg-surface-inset motion-reduce:transition-none',
        highlighted && 'rounded-item bg-accent-soft ring-1 ring-accent-line',
        justDone?.fading && 'opacity-0',
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
          'mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
          done
            ? 'border-good bg-good text-white'
            : 'border-border text-transparent hover:border-good hover:text-good',
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn('text-body font-semibold', done ? 'text-text-muted line-through' : 'text-text-primary')}>
          {item.title}
        </span>
        {(!done || justDone) && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-text-muted">
            {done ? null : slipped ? (
              <span className="flex items-center gap-1 text-attn">
                <Hourglass className="h-3.5 w-3.5" />
                {stillToDoLabel(slipped, now)}
              </span>
            ) : item.starts_at ? (
              <span className="flex items-center gap-1" title="Scheduled">
                <CalendarClock className="h-3.5 w-3.5" />
                {dayAndTime(item.starts_at, now)}
              </span>
            ) : item.due_at ? (
              <span>{doByLabel(item.due_at, now)}</span>
            ) : null}
            {item.duration_min != null && (
              <span className="flex items-center gap-1" title="Time estimate">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(item.duration_min)}
              </span>
            )}
            {showCourse && item.course && (
              <span
                className={cn(
                  'inline-flex h-[22px] items-center rounded-full px-2 font-semibold capitalize',
                  courseTone(item.course).tint,
                  courseTone(item.course).ink,
                )}
              >
                {item.course}
              </span>
            )}
            {!justDone && <SourceLink item={item} onScopeChange={onScopeChange} onShowMoment={onShowMoment} />}
            {justDone && (
              <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-item bg-good-soft px-2.5 font-semibold text-good">
                <Check className="h-3.5 w-3.5" aria-hidden />
                <span>Done</span>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={justDone.onUndo}
                  aria-label={`Undo: ${item.title}`}
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  Undo
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          aria-label={`Not doing: ${item.title}`}
          title="Not doing this"
          onClick={onDismiss}
          // Always visible (faint at rest, full on touch) so it can be found without hover.
          className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-muted opacity-50 transition-opacity hover:bg-surface-overlay hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:h-6 pointer-coarse:w-6 pointer-coarse:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  )
}
