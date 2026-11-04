// PROTOTYPE (flow audit p4b, "week peek"). Throwaway: proto/p4-week-peek only.
// What "Xh to study" in the top bar opens, from any board. Three variants
// (see packages/shared-ui/src/prototype-p4.tsx): A popover week strip,
// B a slide-over sheet with the real Calendar, C a "Today and next" agenda.
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { CalendarDays, CalendarPlus, Flag, ListTodo, Sparkles, X } from 'lucide-react'
import { usePlanItemList } from '@pls/substrate-client'
import { formatMinutes, type PlanItemOccurrence } from '@pls/substrate'
import { closeP4Peek, cn, courseTone, requestP4Plan, useNarrowScreen, useP4 } from '@pls/shared-ui'

export interface WeekPeekProps {
  /** The real Calendar widget, for variant B's sheet. */
  renderCalendar: () => ReactNode
  /** Whether the board on screen already has a Calendar. */
  boardHasCalendar: boolean
  /** The name of another board with a Calendar, if any. */
  calendarBoardName?: string
  onAddCalendar: () => void
  /** "Plan my week": Help me plan on this board's Calendar, else another board's, else a new one here. */
  onPlanWeek: () => void
}

const DAY_MS = 86_400_000
function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function startOfWeek(d: Date) {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
const weekday = (d: Date, style: 'short' | 'long' = 'short') => d.toLocaleDateString([], { weekday: style })

/** When a row happens: a block's start, else a due item's due time. */
function at(item: PlanItemOccurrence): number {
  return Date.parse(item.starts_at ?? item.due_at ?? '')
}
function isBlock(item: PlanItemOccurrence) {
  return item.starts_at != null
}
function minutes(item: PlanItemOccurrence) {
  if (item.starts_at && item.ends_at) return (Date.parse(item.ends_at) - Date.parse(item.starts_at)) / 60_000
  return item.duration_min ?? 0
}
type Kind = 'class' | 'shift' | 'study' | 'due'
function kindOf(item: PlanItemOccurrence): Kind {
  if (item.kind === 'commitment') return item.subtype === 'shift' ? 'shift' : 'class'
  if (item.kind === 'deadline' || !isBlock(item)) return 'due'
  return 'study'
}

function useWeek() {
  const now = Date.now()
  const monday = startOfWeek(new Date(now))
  const from = monday.toISOString()
  const to = new Date(monday.getTime() + 7 * DAY_MS).toISOString()
  const { data } = usePlanItemList({ from, to, statuses: ['open', 'done'] })
  const { data: unbooked } = usePlanItemList({ kinds: ['task'], statuses: ['open'], scheduled: false })
  const items = useMemo(
    () => ((data ?? []) as PlanItemOccurrence[]).filter((i) => !Number.isNaN(at(i))).sort((a, b) => at(a) - at(b)),
    [data],
  )
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY_MS))
  const studyBooked = items.filter((i) => kindOf(i) === 'study' && at(i) >= now).reduce((m, i) => m + minutes(i), 0)
  const notBooked = ((unbooked ?? []) as PlanItemOccurrence[])
  const notBookedMin = notBooked.reduce((m, i) => m + (i.duration_min ?? 0), 0)
  return { now, days, items, studyBooked, notBooked, notBookedMin }
}

/** The two actions every variant offers. */
function Actions({ boardHasCalendar, calendarBoardName, onAddCalendar, onPlanWeek, showPlan = true }: Omit<WeekPeekProps, 'renderCalendar'> & { showPlan?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showPlan && (
        <button
          type="button"
          data-testid="p4-plan-week"
          onClick={onPlanWeek}
          title={boardHasCalendar ? 'Help me plan, on this board' : calendarBoardName ? `Help me plan, on ${calendarBoardName}` : 'Adds a Calendar here and opens Help me plan'}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3.5 text-body font-semibold text-accent-foreground hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" />
          Plan my week
        </button>
      )}
      {!boardHasCalendar && (
        <button
          type="button"
          data-testid="p4-add-calendar"
          onClick={onAddCalendar}
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border bg-surface-raised px-3.5 text-body font-semibold text-text-primary hover:bg-surface-overlay"
        >
          <CalendarPlus className="h-4 w-4" />
          Add Calendar to this board
        </button>
      )}
    </div>
  )
}

function Summary({ studyBooked, notBooked, notBookedMin }: Pick<ReturnType<typeof useWeek>, 'studyBooked' | 'notBooked' | 'notBookedMin'>) {
  return (
    <p className="text-meta text-text-secondary">
      <span className="font-semibold text-text-primary">{formatMinutes(studyBooked)}</span> of study booked for the rest of the week
      {notBooked.length > 0 && (
        <> · {notBooked.length} to-do{notBooked.length !== 1 ? 's' : ''} ({formatMinutes(notBookedMin)}) not booked yet</>
      )}
    </p>
  )
}

/** A compact row for one item: a coloured mark, its time and title. */
function Chip({ item, dense }: { item: PlanItemOccurrence; dense?: boolean }) {
  const kind = kindOf(item)
  const tone = courseTone(item.course)
  return (
    <div
      title={`${item.title}${item.starts_at ? ` ${clock(item.starts_at)}` : item.due_at ? ` due ${clock(item.due_at)}` : ''}`}
      className={cn(
        'flex min-w-0 gap-1.5 rounded-[6px] px-1.5 py-0.5 text-meta',
        dense ? 'items-start' : 'items-center',
        kind === 'study' && 'bg-accent-soft text-accent',
        kind === 'class' && cn(tone.tint, tone.ink),
        kind === 'shift' && 'bg-surface-overlay text-text-secondary',
        kind === 'due' && 'border border-dashed border-attn/50 text-attn',
        item.status === 'done' && 'opacity-50 line-through',
      )}
    >
      {kind === 'due' ? <Flag className="mt-0.5 h-3 w-3 shrink-0" /> : <span aria-hidden className={cn('mt-0.5 h-3 w-1 shrink-0 self-stretch rounded-full', kind === 'study' ? 'bg-accent' : kind === 'shift' ? 'bg-text-muted' : tone.stripe)} />}
      {dense ? (
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] tabular-nums opacity-80">{kind === 'due' ? `due ${clock(item.due_at!)}` : clock(item.starts_at!)}</span>
          <span className="line-clamp-2 font-medium leading-snug">{item.title}</span>
        </span>
      ) : (
        <>
          <span className="shrink-0 tabular-nums">{clock(item.starts_at ?? item.due_at!)}</span>
          <span className="truncate font-medium">{item.title}</span>
        </>
      )}
    </div>
  )
}

/** Variant A: a popover with a compact week strip. */
function WeekStrip(props: Omit<WeekPeekProps, 'renderCalendar'>) {
  const week = useWeek()
  const { anchor } = useP4()
  const narrow = useNarrowScreen()
  const today = startOfDay(new Date(week.now)).getTime()
  const width = Math.min(1040, window.innerWidth - 16)
  const left = narrow ? 8 : Math.max(8, Math.min((anchor?.left ?? 0) + (anchor?.width ?? 0) / 2 - width / 2, window.innerWidth - width - 8))
  const top = (anchor?.bottom ?? 64) + 10
  return (
    <Dismissable>
      <div
        role="dialog"
        aria-label="Your week"
        data-testid="p4-peek"
        className="fixed z-[10060] flex max-h-[calc(100dvh-120px)] flex-col gap-3 overflow-y-auto rounded-widget border border-border-subtle bg-surface-raised p-4 shadow-[var(--shadow-pop)]"
        style={{ top, left, width }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-title font-semibold text-text-primary">Your week</p>
            <Summary {...week} />
          </div>
          <CloseButton />
        </div>
        <div className={cn(narrow ? 'flex flex-col gap-1.5' : 'grid grid-cols-7 gap-1.5')}>
          {week.days.map((d) => {
            const dayItems = week.items.filter((i) => startOfDay(new Date(at(i))).getTime() === d.getTime())
            const study = dayItems.filter((i) => kindOf(i) === 'study').reduce((m, i) => m + minutes(i), 0)
            const isToday = d.getTime() === today
            const past = d.getTime() < today
            return (
              <div
                key={d.toISOString()}
                data-testid="p4-day"
                className={cn(
                  'flex min-w-0 gap-1.5 rounded-item border p-1.5',
                  narrow ? 'flex-row items-start' : 'min-h-36 flex-col',
                  isToday ? 'border-accent bg-accent-soft/40' : 'border-border-subtle',
                  past && 'opacity-55',
                )}
              >
                <div className={cn('flex shrink-0 items-baseline justify-between gap-1', narrow && 'w-16 flex-col items-start')}>
                  <span className={cn('text-meta font-semibold', isToday ? 'text-accent' : 'text-text-primary')}>
                    {isToday ? 'Today' : weekday(d)} <span className="font-normal text-text-muted">{d.getDate()}</span>
                  </span>
                  {study > 0 && <span className="text-[11px] font-semibold tabular-nums text-text-muted">{formatMinutes(study)}</span>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {dayItems.length === 0 && <span className="text-meta text-text-muted">Free</span>}
                  {dayItems.map((i) => <Chip key={i.occurrence_key} item={i} dense={!narrow} />)}
                </div>
              </div>
            )
          })}
        </div>
        <Actions {...props} />
      </div>
    </Dismissable>
  )
}

/** Variant B: a right-hand sheet with the real Calendar widget. */
function CalendarSheet({ renderCalendar, ...props }: WeekPeekProps) {
  const narrow = useNarrowScreen()
  return (
    <div className="fixed inset-0 z-[10060] flex justify-end">
      <button type="button" aria-label="Close your week" onClick={closeP4Peek} className="absolute inset-0 bg-black/25 motion-safe:animate-[fadeIn_150ms_ease-out]" />
      <div
        role="dialog"
        aria-label="Your week"
        data-testid="p4-peek"
        className={cn(
          'relative flex h-full flex-col gap-3 border-l border-border-subtle bg-surface-raised p-4 shadow-[var(--shadow-pop)] motion-safe:animate-[p4SlideIn_200ms_ease-out]',
          narrow ? 'w-full' : 'w-[min(960px,calc(100vw-120px))]',
        )}
      >
        <style>{'@keyframes p4SlideIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}'}</style>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-accent" />
            <p className="text-title font-semibold text-text-primary">Your week</p>
          </div>
          <div className="flex items-center gap-2">
            <Actions {...props} showPlan={false} />
            <CloseButton />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-widget border border-border-subtle p-3">{renderCalendar()}</div>
      </div>
    </div>
  )
}

/** Variant C: "Today and next", then what's due this week. */
function Agenda(props: Omit<WeekPeekProps, 'renderCalendar'>) {
  const week = useWeek()
  const { anchor } = useP4()
  const narrow = useNarrowScreen()
  const next = week.items.filter((i) => (i.ends_at ? Date.parse(i.ends_at) : at(i)) >= week.now && isBlock(i)).slice(0, 5)
  const due = week.items.filter((i) => !isBlock(i) && at(i) >= week.now)
  const width = Math.min(400, window.innerWidth - 16)
  const left = narrow ? 8 : Math.max(8, Math.min((anchor?.left ?? 0) + (anchor?.width ?? 0) - width + 24, window.innerWidth - width - 8))
  const today = startOfDay(new Date(week.now)).getTime()
  const dayLabel = (t: number) => {
    const d = startOfDay(new Date(t)).getTime()
    return d === today ? 'Today' : d === today + DAY_MS ? 'Tomorrow' : weekday(new Date(t), 'long')
  }
  let lastDay = ''
  return (
    <Dismissable>
      <div
        role="dialog"
        aria-label="Today and next"
        data-testid="p4-peek"
        className="fixed z-[10060] flex max-h-[calc(100dvh-120px)] flex-col gap-3 overflow-y-auto rounded-widget border border-border-subtle bg-surface-raised p-4 shadow-[var(--shadow-pop)]"
        style={{ top: (anchor?.bottom ?? 64) + 10, left, width }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-title font-semibold text-text-primary">Today and next</p>
          <CloseButton />
        </div>
        <ol className="flex flex-col">
          {next.length === 0 && <li className="text-body text-text-muted">Nothing else booked this week.</li>}
          {next.map((i) => {
            const label = dayLabel(at(i))
            const head = label !== lastDay
            lastDay = label
            const kind = kindOf(i)
            const tone = courseTone(i.course)
            const live = Date.parse(i.starts_at!) <= week.now
            return (
              <li key={i.occurrence_key} className="flex flex-col">
                {head && <span className="mt-1.5 mb-1 text-meta font-semibold uppercase tracking-wide text-text-muted">{label}</span>}
                <div className="flex items-center gap-3 rounded-item px-1 py-1.5">
                  <span className="w-11 shrink-0 text-right text-meta tabular-nums text-text-secondary">{clock(i.starts_at!)}</span>
                  <span aria-hidden className={cn('h-8 w-1 shrink-0 rounded-full', kind === 'study' ? 'bg-accent' : kind === 'shift' ? 'bg-text-muted' : tone.stripe)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-text-primary">{i.title}</p>
                    <p className="text-meta text-text-muted">
                      {kind === 'study' ? 'Study' : kind === 'shift' ? 'Shift' : 'Class'} · until {clock(i.ends_at!)}
                      {live && <span className="ml-1 font-semibold text-accent">· now</span>}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
        {due.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
            <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">Due this week</span>
            {due.map((i) => (
              <div key={i.occurrence_key} className="flex items-center gap-2 py-1">
                {i.kind === 'deadline' ? <Flag className="h-3.5 w-3.5 shrink-0 text-attn" /> : <ListTodo className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
                <span className="min-w-0 flex-1 truncate text-body text-text-primary">{i.title}</span>
                <span className="shrink-0 text-meta tabular-nums text-text-secondary">{weekday(new Date(at(i)))} {clock(i.due_at!)}</span>
              </div>
            ))}
          </div>
        )}
        <Summary {...week} />
        <Actions {...props} />
      </div>
    </Dismissable>
  )
}

function CloseButton() {
  return (
    <button type="button" aria-label="Close" onClick={closeP4Peek} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-overlay">
      <X className="h-4 w-4" />
    </button>
  )
}

/** Closes on Escape or a press outside (not on the trigger, which toggles). */
function Dismissable({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeP4Peek()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (ref.current?.contains(t) || t.closest?.('[data-testid="p4-trigger"]') || t.closest?.('[data-testid="p4-switcher"]')) return
      closeP4Peek()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [])
  return <div ref={ref}>{children}</div>
}

/** PROTOTYPE: the week peek, in the variant the URL picks. */
export function WeekPeek(props: WeekPeekProps) {
  const { open, variant } = useP4()
  useEffect(() => {
    if (!open || variant !== 'b') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeP4Peek()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, variant])
  if (!open) return null
  if (variant === 'b') return <CalendarSheet {...props} />
  if (variant === 'c') return <Agenda {...props} />
  return <WeekStrip {...props} />
}

export { requestP4Plan }
