import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PlanItemOccurrence } from '@pls/substrate'
import { cn } from '@pls/shared-ui'
import { AudioLines, Check, Repeat } from 'lucide-react'
import { dueMarkers, isMovable, layoutDays, type DaySegment } from './layout'
import { toneFor } from './colors'
import {
  DAY_END_HOUR, DAY_START_HOUR, MINUTES_PER_DAY, SNAP_MIN,
  atMinutes, clamp, formatClock, formatHour, formatSpan, formatWeekday,
  sameDay, snap, snapDown, wallMinutes,
} from './time'

export interface Anchor {
  clientX: number
  clientY: number
}

export interface TimeGridProps {
  days: Date[]
  items: PlanItemOccurrence[]
  now: Date
  /** Styling only: rows outside the highlighted course are dimmed, never hidden. */
  isDimmed: (item: PlanItemOccurrence) => boolean
  /** Styling only: rows linked to the highlighted lecture get a ring. */
  isLinked: (item: PlanItemOccurrence) => boolean
  /** Rows whose popover is open. */
  activeKey?: string
  /** Empty time was clicked or dragged over. */
  onCreate: (start: Date, end: Date, anchor: Anchor) => void
  onOpen: (item: PlanItemOccurrence, anchor: Anchor) => void
  /** A study block was dragged to a new time or resized. */
  onMove: (item: PlanItemOccurrence, start: Date, end: Date) => void
}

/** Fit 08:00-22:00 in the visible height; never cramp below this. */
const MIN_HOUR_PX = 32
const LABEL_ROOM_PX = 8
const DRAG_THRESHOLD_PX = 4
const GUTTER = 'w-12'

type Drag =
  | { type: 'create'; dayIndex: number; fromMin: number; toMin: number; x: number; y: number; moved: boolean }
  | {
      type: 'move' | 'resize'
      item: PlanItemOccurrence
      grabOffsetMs: number
      start: Date
      end: Date
      x: number
      y: number
      moved: boolean
    }

export function TimeGrid({ days, items, now, isDimmed, isLinked, activeKey, onCreate, onOpen, onMove }: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [hourPx, setHourPx] = useState(40)
  // Keep 08:00 at the top until the student scrolls (the grid resizes as the
  // due row appears and the panel is resized).
  const userScrolled = useRef(false)
  const [drag, setDrag] = useState<Drag | null>(null)

  // Size hours so the working day fits the panel, then start scrolled to it.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const fit = () => {
      // A little headroom so the 08:00 and 22:00 labels are not clipped.
      const px = Math.max(MIN_HOUR_PX, (el.clientHeight - 2 * LABEL_ROOM_PX) / (DAY_END_HOUR - DAY_START_HOUR))
      setHourPx(px)
      if (!userScrolled.current) el.scrollTop = DAY_START_HOUR * px - LABEL_ROOM_PX
    }
    const markScrolled = () => { userScrolled.current = true }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    el.addEventListener('wheel', markScrolled, { passive: true })
    el.addEventListener('touchmove', markScrolled, { passive: true })
    el.addEventListener('keydown', markScrolled)
    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', markScrolled)
      el.removeEventListener('touchmove', markScrolled)
      el.removeEventListener('keydown', markScrolled)
    }
  }, [])

  const segments = useMemo(() => layoutDays(items, days), [items, days])
  const markers = useMemo(() => dueMarkers(items, days), [items, days])
  const hasDue = markers.some((m) => m.length > 0)

  // The dragged block's would-be position, laid out like any other block.
  const preview = useMemo(() => {
    if (!drag || drag.type === 'create' || !drag.moved || !isMovable(drag.item)) return null
    const row = { ...drag.item, starts_at: drag.start.toISOString(), ends_at: drag.end.toISOString(), occurrence_key: 'preview' }
    return layoutDays([row], days)
  }, [drag, days])

  /** Day column and wall-clock minute under the pointer. */
  const pointAt = (clientX: number, clientY: number) => {
    const rect = areaRef.current!.getBoundingClientRect()
    const dayIndex = clamp(Math.floor(((clientX - rect.left) / rect.width) * days.length), 0, days.length - 1)
    const minute = clamp(((clientY - rect.top) / hourPx) * 60, 0, MINUTES_PER_DAY)
    return { dayIndex, minute }
  }

  const startCreate = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-block]')) return
    const { dayIndex, minute } = pointAt(e.clientX, e.clientY)
    areaRef.current!.setPointerCapture(e.pointerId)
    setDrag({ type: 'create', dayIndex, fromMin: minute, toMin: minute, x: e.clientX, y: e.clientY, moved: false })
  }

  const startBlockDrag = (e: ReactPointerEvent, item: PlanItemOccurrence, type: 'move' | 'resize') => {
    if (e.button !== 0) return
    e.stopPropagation()
    const { dayIndex, minute } = pointAt(e.clientX, e.clientY)
    const start = new Date(item.starts_at!)
    const end = new Date(item.ends_at!)
    areaRef.current!.setPointerCapture(e.pointerId)
    setDrag({
      type,
      item,
      grabOffsetMs: atMinutes(days[dayIndex], minute).getTime() - start.getTime(),
      start,
      end,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    })
  }

  const handleMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_THRESHOLD_PX
    const { dayIndex, minute } = pointAt(e.clientX, e.clientY)
    if (drag.type === 'create') {
      setDrag({ ...drag, moved, dayIndex: drag.dayIndex, toMin: minute })
      return
    }
    if (!isMovable(drag.item)) {
      if (moved !== drag.moved) setDrag({ ...drag, moved })
      return
    }
    const original = { start: new Date(drag.item.starts_at!), end: new Date(drag.item.ends_at!) }
    const pointer = atMinutes(days[dayIndex], minute)
    if (drag.type === 'move') {
      const rawStart = new Date(pointer.getTime() - drag.grabOffsetMs)
      const day = new Date(rawStart.getFullYear(), rawStart.getMonth(), rawStart.getDate())
      const start = atMinutes(day, snap(wallMinutes(rawStart)))
      const end = new Date(start.getTime() + (original.end.getTime() - original.start.getTime()))
      setDrag({ ...drag, moved, start, end })
    } else {
      const day = days[dayIndex]
      const snapped = atMinutes(day, snap(minute))
      const minEnd = original.start.getTime() + SNAP_MIN * 60_000
      setDrag({ ...drag, moved, start: original.start, end: new Date(Math.max(minEnd, snapped.getTime())) })
    }
  }

  const handleUp = (e: ReactPointerEvent) => {
    if (!drag) return
    setDrag(null)
    const anchor = { clientX: e.clientX, clientY: e.clientY }
    if (drag.type === 'create') {
      const day = days[drag.dayIndex]
      if (drag.moved) {
        const a = snap(Math.min(drag.fromMin, drag.toMin))
        const b = snap(Math.max(drag.fromMin, drag.toMin))
        onCreate(atMinutes(day, a), atMinutes(day, Math.max(b, a + SNAP_MIN)), anchor)
      } else {
        const from = Math.min(snapDown(drag.fromMin, 30), MINUTES_PER_DAY - 60)
        onCreate(atMinutes(day, from), atMinutes(day, from + 60), anchor)
      }
      return
    }
    if (!drag.moved) {
      onOpen(drag.item, anchor)
      return
    }
    if (!isMovable(drag.item)) return
    const unchanged = drag.start.getTime() === Date.parse(drag.item.starts_at!) && drag.end.getTime() === Date.parse(drag.item.ends_at!)
    if (!unchanged) onMove(drag.item, drag.start, drag.end)
  }

  const createDraft = drag?.type === 'create' && drag.moved
    ? { dayIndex: drag.dayIndex, from: snap(Math.min(drag.fromMin, drag.toMin)), to: snap(Math.max(drag.fromMin, drag.toMin)) }
    : null
  const draggingKey = preview && drag?.type !== 'create' ? drag?.item.occurrence_key : undefined
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface/40">
      {/* Day headers (scrollbar gutter kept so columns line up with the body) */}
      <div className="flex shrink-0 overflow-hidden border-b border-border-subtle [scrollbar-gutter:stable]">
        <div className={cn(GUTTER, 'shrink-0')} />
        <div className="grid flex-1" style={cols}>
          {days.map((day) => {
            const isToday = sameDay(day, now)
            return (
              <div
                key={day.toISOString()}
                data-testid="calendar-day-header"
                className="flex items-baseline justify-center gap-1.5 border-l border-border-subtle/70 py-2"
              >
                <span className={cn('text-[10px] font-medium uppercase tracking-wider', isToday ? 'text-accent' : 'text-text-muted')}>
                  {formatWeekday(day)}
                </span>
                <span
                  className={cn(
                    'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums',
                    isToday ? 'bg-accent text-accent-foreground' : 'text-text-secondary',
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* All-day row: what's due */}
      {hasDue && (
        <div className="flex shrink-0 overflow-hidden border-b border-border-subtle [scrollbar-gutter:stable]">
          <div className={cn(GUTTER, 'flex shrink-0 items-start justify-end pr-2 pt-1.5 text-[9px] font-medium uppercase tracking-wider text-text-muted')}>
            Due
          </div>
          <div className="grid flex-1" style={cols}>
            {markers.map((dayMarkers, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-0.5 border-l border-border-subtle/70 p-1">
                {dayMarkers.map((m) => {
                  const tone = toneFor(m.item.course)
                  const done = m.item.status === 'done'
                  return (
                    <button
                      key={m.key}
                      type="button"
                      data-block="due"
                      data-testid="calendar-due"
                      onClick={(e) => onOpen(m.item, { clientX: e.clientX, clientY: e.clientY })}
                      title={`${m.item.title} - due ${m.allDay ? 'today' : formatClock(new Date(m.item.due_at!))}`}
                      className={cn(
                        'flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[10px] transition-opacity',
                        tone.due,
                        isDimmed(m.item) && 'opacity-40',
                        isLinked(m.item) && 'ring-2 ring-accent',
                        activeKey === m.key && 'ring-2 ring-accent/70',
                      )}
                    >
                      {done ? <Check className="h-2.5 w-2.5 shrink-0" /> : <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.bar)} />}
                      <span className={cn('truncate font-medium', done && 'line-through opacity-70')}>{m.item.title}</span>
                      {!m.allDay && (
                        <span className="ml-auto shrink-0 tabular-nums text-text-muted">{formatClock(new Date(m.item.due_at!))}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hours */}
      <div ref={scrollRef} data-testid="calendar-scroll" className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="relative flex" style={{ height: 24 * hourPx }}>
          <div className={cn(GUTTER, 'relative shrink-0')}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-text-muted"
                style={{ top: h * hourPx }}
              >
                {formatHour(h)}
              </span>
            ))}
          </div>

          <div
            ref={areaRef}
            data-testid="calendar-grid"
            className={cn('relative grid flex-1 select-none', drag?.type === 'create' && 'cursor-ns-resize')}
            style={{ ...cols, touchAction: 'none' }}
            onPointerDown={startCreate}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={() => setDrag(null)}
          >
            {/* Hour and half-hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: h * hourPx }}>
                {h > 0 && <div className="border-t border-border-subtle/80" />}
                <div className="border-t border-dashed border-border-subtle/35" style={{ marginTop: hourPx / 2 - 1 }} />
              </div>
            ))}

            {days.map((day, dayIndex) => {
              const isToday = sameDay(day, now)
              return (
                <div
                  key={day.toISOString()}
                  data-testid="calendar-day"
                  data-date={day.toISOString()}
                  className={cn('relative border-l border-border-subtle/70', isToday && 'bg-accent/[0.03]')}
                >
                  {segments[dayIndex].map((seg) => (
                    <Block
                      key={seg.key}
                      seg={seg}
                      hourPx={hourPx}
                      dimmed={isDimmed(seg.item)}
                      linked={isLinked(seg.item)}
                      active={activeKey === seg.item.occurrence_key}
                      lifted={draggingKey === seg.item.occurrence_key}
                      onPointerDown={(e, type) => startBlockDrag(e, seg.item, type)}
                      onKeyOpen={(anchor) => onOpen(seg.item, anchor)}
                    />
                  ))}

                  {markers[dayIndex].filter((m) => !m.allDay).map((m) => (
                    <div
                      key={m.key}
                      className="pointer-events-none absolute inset-x-0 flex items-center"
                      style={{ top: (m.minute / 60) * hourPx - 1 }}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', toneFor(m.item.course).marker, isDimmed(m.item) && 'opacity-40')} />
                      <span className={cn('h-px flex-1', toneFor(m.item.course).marker, isDimmed(m.item) ? 'opacity-20' : 'opacity-50')} />
                    </div>
                  ))}

                  {preview?.[dayIndex].map((seg) => (
                    <Block key={seg.key} seg={seg} hourPx={hourPx} preview />
                  ))}

                  {createDraft?.dayIndex === dayIndex && createDraft.to > createDraft.from && (
                    <div
                      data-testid="calendar-draft"
                      className="pointer-events-none absolute inset-x-1 rounded-lg bg-accent/15 ring-1 ring-accent/50"
                      style={{ top: (createDraft.from / 60) * hourPx, height: ((createDraft.to - createDraft.from) / 60) * hourPx }}
                    >
                      <span className="block px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-accent">
                        {formatSpan(atMinutes(day, createDraft.from), atMinutes(day, createDraft.to))}
                      </span>
                    </div>
                  )}

                  {isToday && (
                    <div
                      data-testid="calendar-now"
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      style={{ top: (wallMinutes(now) / 60) * hourPx - 3 }}
                    >
                      <span className="-ml-1 h-1.5 w-1.5 rounded-full bg-accent" />
                      <span className="h-px flex-1 bg-accent/70" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

interface BlockProps {
  seg: DaySegment
  hourPx: number
  dimmed?: boolean
  linked?: boolean
  active?: boolean
  /** Being dragged: the original stays as a faint placeholder. */
  lifted?: boolean
  /** The would-be position while dragging. */
  preview?: boolean
  onPointerDown?: (e: ReactPointerEvent, type: 'move' | 'resize') => void
  onKeyOpen?: (anchor: Anchor) => void
}

function Block({ seg, hourPx, dimmed, linked, active, lifted, preview, onPointerDown, onKeyOpen }: BlockProps) {
  const { item } = seg
  const tone = toneFor(item.course)
  const isCommitment = item.kind === 'commitment'
  const movable = isMovable(item)
  const done = item.status === 'done'
  const top = (seg.startMin / 60) * hourPx
  const height = Math.max(18, ((seg.endMin - seg.startMin) / 60) * hourPx - 2)
  const roomy = height >= 30
  const start = new Date(item.starts_at!)
  const end = new Date(item.ends_at!)
  const fromMoment = item.source_type === 'recording' && item.source_id != null
  const kindLabel = isCommitment ? (item.subtype ?? 'Fixed') : 'Study time'

  return (
    <div
      role={preview ? undefined : 'button'}
      tabIndex={preview ? undefined : 0}
      data-block={item.kind}
      data-testid={preview ? 'calendar-block-preview' : 'calendar-block'}
      data-kind={item.kind}
      data-dimmed={dimmed || undefined}
      data-linked={linked || undefined}
      aria-label={`${item.title}, ${kindLabel.toLowerCase()}, ${formatSpan(start, end)}${done ? ', done' : ''}`}
      title={isCommitment ? `${item.title} - fixed, open to edit` : movable ? `${item.title} - drag to move` : item.title}
      onPointerDown={preview ? undefined : (e) => onPointerDown?.(e, 'move')}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onKeyOpen?.({ clientX: rect.right, clientY: rect.top })
      }}
      className={cn(
        'group absolute overflow-hidden rounded-lg text-left outline-none transition-[opacity,box-shadow,background-color] duration-150',
        'focus-visible:ring-2 focus-visible:ring-accent',
        // Opaque base so grid lines don't show through the tint.
        'bg-surface-raised',
        movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        seg.continuesBefore && 'rounded-t-none',
        seg.continuesAfter && 'rounded-b-none',
        dimmed && 'opacity-40',
        done && 'opacity-55',
        linked && 'ring-2 ring-accent shadow-[0_0_0_4px_rgba(99,102,241,0.12)]',
        active && 'ring-2 ring-accent/70',
        lifted && 'opacity-30',
        preview && 'pointer-events-none z-30 shadow-lg ring-2 ring-accent/60',
      )}
      style={{
        top: top + 1,
        height,
        left: `calc(${(seg.column / seg.columns) * 100}% + 2px)`,
        width: `calc(${100 / seg.columns}% - 4px)`,
      }}
    >
      <span aria-hidden className={cn('pointer-events-none absolute inset-0 rounded-[inherit] transition-colors', isCommitment ? tone.commitment : tone.study)} />
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', tone.bar)} />
      <div className={cn('relative flex h-full min-w-0 flex-col pl-2 pr-1', roomy ? 'py-[3px]' : 'justify-center')}>
        <div className="flex min-w-0 items-center gap-1">
          {done && <Check className="h-3 w-3 shrink-0 text-text-secondary" />}
          <span className={cn('truncate text-[11px] font-medium leading-tight text-text-primary', done && 'line-through')}>
            {item.title}
          </span>
          {fromMoment && <AudioLines className="h-3 w-3 shrink-0 text-text-secondary" aria-hidden />}
          {item.recurrence && <Repeat className="h-2.5 w-2.5 shrink-0 text-text-muted" aria-hidden />}
        </div>
        {roomy && (
          <span className="truncate text-[10px] tabular-nums leading-tight text-text-secondary">
            {formatSpan(start, end)}
          </span>
        )}
      </div>
      {movable && !preview && (
        <div
          data-testid="calendar-block-resize"
          aria-hidden
          onPointerDown={(e) => onPointerDown?.(e, 'resize')}
          className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-end justify-center opacity-0 transition-opacity group-hover:opacity-100"
        >
          <span className="mb-0.5 h-0.5 w-6 rounded-full bg-text-muted/60" />
        </div>
      )}
    </div>
  )
}
