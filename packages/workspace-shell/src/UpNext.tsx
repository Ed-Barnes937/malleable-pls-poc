import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, CalendarPlus, Flag, ListTodo, Sparkles, X } from 'lucide-react'
import { usePlanItemList, usePreferences } from '@pls/substrate-client'
import { formatMinutes, type PlanItemOccurrence } from '@pls/substrate'
import { cn, courseTone, SectionLabel, useNarrowScreen } from '@pls/shared-ui'
import {
  upNextLabel,
  upNextRange,
  upNextSummary,
  upNextZone,
  type UpNextDay,
  type UpNextItem,
  type UpNextSummary,
} from './up-next'

const MINUTE_MS = 60_000
const POPOVER_WIDTH = 400
const EDGE = 8
const GAP = 8

/** The current time, ticking each minute so "now" and the next item stay true. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => clearInterval(id)
  }, [])
  return now
}

export interface UpNextProps {
  /** Whether the board on screen has a Calendar. */
  boardHasCalendar: boolean
  /** "Plan my week": Help me plan, in Week view, on this board's Calendar (added first when there is none). */
  onPlanWeek: () => void
  /** Adds a Calendar to this board. */
  onAddCalendar: () => void
}

/**
 * The top bar's Up next: a button naming the next item in the student's
 * calendar ("Up next: Cafe shift 17:00", "Now: Chemistry" while it is on), or "Plan your
 * week" when nothing is booked. It opens a popover with the next few items,
 * what is due this week, and a way to plan and to add the Calendar to this
 * board. Always in the bar, at every width.
 */
export function UpNext({ boardHasCalendar, onPlanWeek, onAddCalendar, className }: UpNextProps & { className?: string }) {
  const now = useMinuteClock()
  const narrow = useNarrowScreen()
  const preferences = usePreferences()
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const zone = upNextZone(preferences.data, preferences.isError, browserZone)
  // The query key is the same all day, so a minute ticking over refetches nothing.
  const range = useMemo(() => (zone ? upNextRange(now, zone) : null), [now, zone])
  // The day rolling over changes the range: keep showing the last answer meanwhile.
  const rows = usePlanItemList({ ...(range ?? {}), statuses: ['open'] }, { enabled: !!range, keepPrevious: true })
  const tasks = usePlanItemList({ kinds: ['task'], statuses: ['open', 'done'] })

  const summary = useMemo(
    () => (zone && rows.data && tasks.data
      ? upNextSummary(rows.data as PlanItemOccurrence[], tasks.data as PlanItemOccurrence[], { now, timeZone: zone })
      : null),
    [rows.data, tasks.data, now, zone],
  )

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()
  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const label = summary
    ? summary.next && zone ? upNextLabel(summary.next, now, zone) : 'Plan your week'
    : null

  // What the bar has left decides how much of the button shows (container
  // queries on the box the bar hands it): the label truncates first, then
  // only the icon is left. The bar never gives room to it before the board
  // tabs and scope pills have theirs.
  const live = !!summary?.next?.live

  return (
    <div className={cn('@container flex min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        data-testid="up-next"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        title={label ? (live ? label : `Up next: ${label}`) : 'Up next'}
        className={cn(
          'inline-flex h-9 max-w-72 min-w-0 items-center gap-2 rounded-control border border-border bg-surface-raised px-3 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay',
          !narrow && '@max-[8rem]:w-9 @max-[8rem]:justify-center @max-[8rem]:gap-0 @max-[8rem]:px-0',
          open && 'bg-surface-overlay',
        )}
      >
        <CalendarClock aria-hidden className="h-4 w-4 shrink-0 text-accent" />
        <span className={cn('min-w-0 truncate', !narrow && '@max-[8rem]:sr-only')}>
          {summary?.next && !live && (
            <span className="text-text-secondary @max-[19rem]:sr-only">Up next: </span>
          )}
          <span data-testid="up-next-label">{label ?? 'Up next'}</span>
        </span>
      </button>
      {open && (
        <UpNextPopover
          id={popoverId}
          triggerRef={triggerRef}
          summary={summary}
          now={now}
          zone={zone}
          boardHasCalendar={boardHasCalendar}
          onClose={close}
          onPlanWeek={() => {
            close()
            onPlanWeek()
          }}
          onAddCalendar={() => {
            close()
            onAddCalendar()
          }}
        />
      )}
    </div>
  )
}

/** Where the popover goes: under the trigger, kept inside the screen (the full width on a phone). */
function usePopoverPosition(triggerRef: React.RefObject<HTMLElement | null>, narrow: boolean) {
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    const width = narrow ? window.innerWidth - 2 * EDGE : Math.min(POPOVER_WIDTH, window.innerWidth - 2 * EDGE)
    const left = narrow || !rect ? EDGE : Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE))
    return { top: (rect?.bottom ?? 0) + GAP, left, width }
  }, [triggerRef, narrow])
  // Placed on the first render, so it can take focus at once.
  const [pos, setPos] = useState(place)
  useLayoutEffect(() => {
    const onResize = () => setPos(place())
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [place])
  return pos
}

function UpNextPopover({ id, triggerRef, summary, now, zone, boardHasCalendar, onClose, onPlanWeek, onAddCalendar }: {
  id: string
  triggerRef: React.RefObject<HTMLButtonElement | null>
  summary: UpNextSummary | null
  now: number
  zone: string | null
  boardHasCalendar: boolean
  onClose: (restoreFocus?: boolean) => void
  onPlanWeek: () => void
  onAddCalendar: () => void
}) {
  const narrow = useNarrowScreen()
  const ref = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(triggerRef, narrow)

  // Focus moves in on open.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    // A press outside closes it (the trigger toggles on its own), and leaves
    // focus where the press put it, unless that is nowhere.
    const onPress = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || triggerRef.current?.contains(target)) return
      onClose(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [onClose, triggerRef])

  // Tab moves through the popover's buttons itself, and past either end
  // leaves for the button it came from: the popover is rendered at the end of
  // the page, so the browser's own next stop would be somewhere unrelated
  // (and differs between browsers).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const box = ref.current
    if (!box) return
    e.preventDefault()
    const stops = [...box.querySelectorAll<HTMLElement>('button:not([disabled])')]
    const at = stops.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? at - 1 : at + 1
    if (next < 0 || next >= stops.length) onClose()
    else stops[next].focus()
  }

  return createPortal(
    // Above the top bar (9999) and the board menu, under dialogs (10010). The
    // toast bar is in the page flow, never over it, and the Calendar's own
    // popovers sit inside the canvas, beneath.
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label="Up next"
      data-testid="up-next-popover"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed z-[10004] flex flex-col gap-3 overflow-y-auto rounded-widget border border-border-subtle bg-surface-raised p-4 shadow-pop outline-none"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: Math.max(160, window.innerHeight - pos.top - EDGE) }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title font-semibold text-text-primary">Up next</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => onClose()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {summary && zone ? (
        <>
          <NextItems days={summary.days} />
          {summary.due.length > 0 && <DueThisWeek due={summary.due} />}
          <SummaryLine summary={summary} />
        </>
      ) : (
        <p className="text-body text-text-muted">Loading your week...</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="up-next-plan-week"
          onClick={onPlanWeek}
          title={boardHasCalendar ? 'Help me plan, on this board' : 'Adds a Calendar here and opens Help me plan'}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3.5 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <Sparkles aria-hidden className="h-4 w-4" />
          Plan my week
        </button>
        {!boardHasCalendar && (
          <button
            type="button"
            data-testid="up-next-add-calendar"
            onClick={onAddCalendar}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border bg-surface-raised px-3.5 text-body font-semibold text-text-primary transition-colors hover:bg-surface-overlay"
          >
            <CalendarPlus aria-hidden className="h-4 w-4" />
            Add Calendar to this board
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <SectionLabel>{children}</SectionLabel>
}

function NextItems({ days }: { days: UpNextDay[] }) {
  if (days.length === 0) {
    return <p data-testid="up-next-empty" className="text-body text-text-muted">Nothing booked yet. Plan your week and it will show up here.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => (
        <section key={day.label} aria-label={day.label} className="flex flex-col">
          <SectionHeading>{day.label}</SectionHeading>
          <ol className="flex flex-col">
            {day.items.map((item) => <NextRow key={item.key} item={item} />)}
          </ol>
        </section>
      ))}
    </div>
  )
}

const TYPE_NAME: Record<UpNextItem['type'], string> = { class: 'Class', shift: 'Shift', study: 'Study' }

function NextRow({ item }: { item: UpNextItem }) {
  const tone = courseTone(item.course)
  return (
    <li data-testid="up-next-item" className="flex items-center gap-3 py-1.5">
      <span className="w-11 shrink-0 text-right text-meta tabular-nums text-text-secondary">{item.time}</span>
      <span
        aria-hidden
        className={cn('h-8 w-1 shrink-0 rounded-full', item.type === 'study' ? 'bg-accent' : item.type === 'shift' ? 'bg-text-muted' : tone.stripe)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-text-primary">{item.name}</p>
        <p className="text-meta text-text-muted">
          {TYPE_NAME[item.type]} · {item.span}
          {item.live && <span className="ml-1 font-semibold text-accent">· now</span>}
        </p>
      </div>
    </li>
  )
}

function DueThisWeek({ due }: { due: UpNextSummary['due'] }) {
  return (
    <section aria-label="Due this week" className="flex flex-col gap-1 border-t border-border-subtle pt-3">
      <SectionHeading>Due this week</SectionHeading>
      <ul className="flex flex-col">
        {due.map((d) => (
          <li key={d.key} data-testid="up-next-due" className="flex items-center gap-2 py-1">
            {d.type === 'deadline'
              ? <Flag aria-hidden className="h-3.5 w-3.5 shrink-0 text-attn" />
              : <ListTodo aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
            <span className="min-w-0 flex-1 truncate text-body text-text-primary">{d.title}</span>
            <span className="shrink-0 text-meta tabular-nums text-text-secondary">{d.when}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SummaryLine({ summary }: { summary: UpNextSummary }) {
  const { studyBookedMin, unbooked } = summary
  return (
    <p data-testid="up-next-summary" className="text-meta text-text-secondary">
      <span className="font-semibold text-text-primary">{formatMinutes(studyBookedMin)}</span> of study booked for the rest of the week
      {unbooked.count > 0 && (
        <> · {unbooked.count} to-do{unbooked.count === 1 ? '' : 's'} ({formatMinutes(unbooked.minutes)}) not booked yet</>
      )}
    </p>
  )
}
