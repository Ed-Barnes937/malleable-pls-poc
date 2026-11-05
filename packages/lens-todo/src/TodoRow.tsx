import type { LensProps } from '@pls/lens-framework'
import { formatMinutes, type PlanItemOccurrence } from '@pls/substrate'
import { cn, courseTone, dayAndTime, doByLabel, formatDuration, stillToDoLabel } from '@pls/shared-ui'
import { CalendarClock, Check, Clock, Hourglass, Sparkles, Undo2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
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
  /** Arrived while the list was on screen (e.g. a review just added). */
  fresh?: boolean
  /** Mounting as it arrives (see `useEnterOnce`): it comes in with the shared motion. */
  enter?: boolean
  onToggle: () => void
  /** Omitted for done to-dos (untick instead). */
  onDismiss?: () => void
  /** Booked for some of its estimate but not all: "1h of 2h booked". */
  booking?: { bookedMin: number; totalMin: number } | null
  /** "Book the rest" (only while partly booked and open). */
  onBookRest?: () => void
  /** Under the row's details, e.g. Book the rest's draft. */
  children?: ReactNode
  onScopeChange: LensProps['onScopeChange']
  onShowMoment: LensProps['onShowMoment']
}

export function TodoRow({ item, now, showCourse, highlighted, justDone, fresh, enter, onToggle, onDismiss, booking, onBookRest, children, onScopeChange, onShowMoment }: TodoRowProps) {
  // A just-ticked row is done straight away, before the save comes back.
  const done = item.status === 'done' || !!justDone
  const slipped = done ? null : slippedAt(item, now)
  // Kept from mount: the motion plays as it arrives, not on later renders.
  const [entering] = useState(!!enter)

  return (
    <li
      data-testid="todo-item"
      data-plan-item-id={item.id}
      // Glides to a new place when the list re-sorts (see useListGlide).
      data-glide-key={item.occurrence_key}
      data-highlighted={highlighted || undefined}
      data-just-done={justDone ? (justDone.fading ? 'fading' : 'shown') : undefined}
      data-fresh={fresh || undefined}
      className={cn(
        'group flex items-start gap-3 border-b border-border-subtle px-1 py-3 transition-[background-color,opacity,scale] duration-300 ease-motion last:border-b-0 hover:bg-surface-inset motion-reduce:transition-none',
        entering && 'origin-top motion-safe:animate-enter',
        highlighted && 'rounded-item bg-accent-soft ring-1 ring-accent-line',
        // Leaving: the arrival's motion in reverse (see JUST_DONE_FADE_MS).
        justDone?.fading && 'opacity-0 motion-safe:scale-[0.97]',
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
            ? 'border-good bg-good text-surface-raised'
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
            {booking && !done ? (
              <span data-testid="todo-booked" className="flex items-center gap-1 font-semibold text-text-secondary" title="Time booked of the estimate">
                <Clock className="h-3.5 w-3.5" />
                {formatMinutes(booking.bookedMin)} of {formatMinutes(booking.totalMin)} booked
              </span>
            ) : item.duration_min != null && (
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
            {booking && !done && onBookRest && (
              <button
                type="button"
                onClick={onBookRest}
                aria-label={`Book the rest of ${item.title}`}
                className="inline-flex h-6 items-center gap-1 rounded-item px-1.5 font-semibold text-accent transition-colors hover:bg-accent-soft pointer-coarse:h-8"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Book the rest
              </button>
            )}
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
        {children}
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
