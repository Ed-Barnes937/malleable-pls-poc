import { useState } from 'react'
import { cn } from '@pls/shared-ui'
import { CalendarClock, Check, Loader2 } from 'lucide-react'
import { slotLabel } from './time'

/**
 * "Find another time" in a study block's popover: 2-3 other slots from the
 * planner (inside study hours and the daily budget, before the block's due
 * time), worked out when asked. Picking one moves the block there; the
 * popover's own fields stay for an exact time.
 */
export function FindAnotherTime({ title, now, busy, saving, slots, onPick, within, due }: {
  title: string
  /** What the slots are drawn from: "this week", "that day". */
  within: string
  /** Its due time: none, still ahead (the slots end by it), or already past (the slots are just free time). */
  due: 'none' | 'ahead' | 'past'
  now: number
  /** The popover is saving: the slots refuse presses. */
  busy?: boolean
  /** The slot being saved, named while it saves. */
  saving?: boolean
  /** Starts (UTC ms) of the other slots, earliest first. */
  slots: () => number[]
  onPick: (start: number) => void
}) {
  const [shown, setShown] = useState<number[] | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(slots())}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 self-start rounded-item border border-border bg-surface-raised px-2.5 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
      >
        <CalendarClock className="h-4 w-4 text-text-muted" aria-hidden />
        Find another time
      </button>
    )
  }
  return (
    <div data-testid="another-time" role="group" aria-label={`Other times for ${title}`} className="flex flex-col gap-1.5">
      <p className="text-meta font-semibold text-text-muted">
        {shown.length > 0
          ? 'Other free times'
          : due === 'ahead' ? `No other free time fits before it is due ${within}.` : `No other free time fits ${within}.`}
      </p>
      {due === 'past' && (
        <p data-testid="another-time-overdue" className="text-meta text-text-secondary">
          {shown.length > 0 ? `It's past its due time. These are ${within === 'this week' ? "this week's" : "that day's"} free slots.` : "It's past its due time."}
        </p>
      )}
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((start) => {
            const pending = saving && picked === start
            return (
              <button
                key={start}
                type="button"
                data-testid="another-time-slot"
                aria-label={`Move ${title} to ${slotLabel(start, now)}`}
                aria-busy={pending || undefined}
                disabled={busy && !pending}
                onClick={() => {
                  if (busy) return
                  setPicked(start)
                  onPick(start)
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-item bg-surface-overlay px-2.5 text-meta font-semibold tabular-nums text-text-primary transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50"
              >
                {pending && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
                {slotLabel(start, now)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * After the last open session of a to-do is ticked: "Tick off <to-do> too?".
 * Ticking a session ticks only that session (flow-audit decision 10), so the
 * to-do is offered, never ticked for the student.
 */
export function TickTodoToo({ title, busy, saving, onTick, onNotYet }: {
  title: string
  busy?: boolean
  saving?: boolean
  onTick: () => void
  onNotYet: () => void
}) {
  return (
    <div data-testid="tick-todo-too" className="flex flex-col gap-2 rounded-item border border-accent-line bg-accent-soft px-3 py-2.5">
      <p className="text-body text-text-primary">
        That was its last session. Tick off <span className="font-semibold">{title}</span> too?
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          autoFocus
          aria-busy={saving || undefined}
          onClick={busy ? undefined : onTick}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-item bg-accent px-2.5 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90',
            busy && !saving && 'opacity-50',
          )}
        >
          {saving ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Check aria-hidden className="h-4 w-4" />}
          {saving ? 'Marking done...' : 'Tick it off'}
        </button>
        <button
          type="button"
          onClick={onNotYet}
          disabled={busy}
          className="inline-flex h-8 items-center rounded-item px-2 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
        >
          Not yet
        </button>
      </div>
    </div>
  )
}
