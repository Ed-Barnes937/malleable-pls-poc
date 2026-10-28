import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { formatMinutes, type PlanItemOccurrence } from '@pls/substrate'
import { cn, courseTone } from '@pls/shared-ui'
import { AudioLines, Check, Coffee, GripVertical, Repeat, X } from 'lucide-react'
import { dueMarkers, isMovable, layoutDays, type DaySegment } from './layout'
import { blockLook, toneFor } from './colors'
import { RevealCallout } from './RevealCallout'
import { ghostId, ghostRow, type Proposal } from './proposals'
import {
  DAY_END_HOUR, DAY_START_HOUR, MINUTES_PER_DAY, SNAP_MIN,
  addDays, atMinutes, clamp, startOfDay, formatClock, formatHour, formatSpan, formatWeekday,
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
  /** Ghost blocks: drafted, not saved (see ./proposals.ts). */
  proposals?: Proposal[]
  /** Proposals accepted and being saved: drawn, but no longer actionable. */
  savedProposalIds?: ReadonlySet<string>
  onProposalMove?: (id: string, start: Date, end: Date) => void
  /** Keyboard adjust: by `minutes` or `days`, hopping past anything in the way (see `ProposalLayer.nudge`). */
  onProposalNudge?: (id: string, minutes: number, days: number) => void
  onProposalAccept?: (id: string) => void
  onProposalDismiss?: (id: string) => void
  /** Free study time to outline and label with its length (UTC ms intervals), e.g. while planning. */
  freeTime?: ReadonlyArray<{ start: number; end: number }>
  /** A to-do being dragged in from outside the grid (Help me plan), to preview where it lands. */
  incoming?: { title: string; durationMin: number; course: string | null } | null
  /** That to-do was dropped at `start`. */
  onDropIncoming?: (start: Date) => void
  /**
   * A block to bring into view and glow once ("See it"), by plan item id; a
   * new `requestId` reveals it again. Waits until the block is on the grid.
   */
  reveal?: { id: string; requestId: number } | null
}

/** How long a revealed block keeps its callout (and, under reduced motion, its still ring). */
const REVEAL_MS = 4000

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Fit 08:00-22:00 in the visible height; never cramp below this. */
const MIN_HOUR_PX = 32
const LABEL_ROOM_PX = 8
/**
 * Blocks are drawn to scale, so a 30-minute block is visibly longer than a
 * 20-minute one; nothing shorter than this many minutes' worth, though.
 */
const MIN_BLOCK_MIN = 15
/**
 * Shorter than this, a block is one compact line: its title, which may
 * overhang the box by a pixel or two and is drawn above the blocks around it,
 * so the next block never paints over it.
 */
const COMPACT_BLOCK_PX = 18

/** A block's height on the grid: proportional to its length, with a 2px gap below. */
function blockHeight(seg: { startMin: number; endMin: number }, hourPx: number): number {
  return (Math.max(MIN_BLOCK_MIN, seg.endMin - seg.startMin) / 60) * hourPx - 2
}
/** Tall enough for a two-line title and the time under it. */
const TWO_LINE_TITLE_PX = 56
/** Tall enough for a free gap's "1h 30m free" label. */
const FREE_LABEL_PX = 28
/** A drafted block's accept and dismiss row, under its title and time. */
const GHOST_BUTTONS_PX = 18

/** One opacity for both reasons to fade, so "done" never un-dims another course. */
function opacityFor(dimmed: boolean | undefined, done: boolean): string | false {
  if (dimmed) return done ? 'opacity-30' : 'opacity-40'
  return done && 'opacity-55'
}
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

export function TimeGrid({
  days, items, now, isDimmed, isLinked, activeKey, onCreate, onOpen, onMove,
  proposals, savedProposalIds, onProposalMove, onProposalNudge, onProposalAccept, onProposalDismiss, freeTime, incoming, onDropIncoming,
  reveal,
}: TimeGridProps) {
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

  // Ghosts are laid out with real blocks, so a dragged one never hides another.
  const segments = useMemo(
    () => layoutDays(proposals?.length ? [...items, ...proposals.map(ghostRow)] : items, days),
    [items, proposals, days],
  )
  // "See it": once the block is laid out, scroll it into the top third and
  // glow it once (a still ring under reduced motion), with a short callout.
  const [revealed, setRevealed] = useState<{ key: string; requestId: number } | null>(null)
  const handledReveal = useRef<number | null>(null)
  useEffect(() => {
    if (!reveal || reveal.requestId === handledReveal.current) return
    const el = scrollRef.current
    const seg = segments.flat().find((s) => s.item.id === reveal.id && !ghostId(s.item))
    if (!el || !seg) return
    handledReveal.current = reveal.requestId
    userScrolled.current = true
    el.scrollTo({
      top: Math.max(0, (seg.startMin / 60) * hourPx - el.clientHeight / 3),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
    setRevealed({ key: seg.key, requestId: reveal.requestId })
  }, [reveal, segments, hourPx])
  useEffect(() => {
    if (!revealed) return
    const t = setTimeout(() => setRevealed(null), REVEAL_MS)
    return () => clearTimeout(t)
  }, [revealed])

  const freeSegments = useMemo(() => (freeTime?.length ? shadeDays(freeTime, days) : null), [freeTime, days])
  const [dropAt, setDropAt] = useState<{ dayIndex: number; minute: number } | null>(null)
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
      // Resizing stays on the block's own day, whichever column the pointer is over.
      const day = startOfDay(original.start)
      const dayEnd = addDays(day, 1).getTime()
      const pointerDay = startOfDay(days[dayIndex]).getTime()
      const snapped = pointerDay > day.getTime() ? dayEnd : pointerDay < day.getTime() ? 0 : atMinutes(day, snap(minute)).getTime()
      const minEnd = original.start.getTime() + SNAP_MIN * 60_000
      setDrag({ ...drag, moved, start: original.start, end: new Date(clamp(snapped, minEnd, Math.max(minEnd, dayEnd))) })
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
    const ghost = ghostId(drag.item)
    if (!drag.moved) {
      // A ghost has its own accept / dismiss buttons; clicking it opens nothing.
      if (!ghost) onOpen(drag.item, anchor)
      // A tap or click selects it instead: focused, its buttons show (on a
      // short ghost they are hidden until then, and touch has no hover).
      // After the click that follows, which would otherwise take focus away.
      else requestAnimationFrame(() => areaRef.current?.querySelector<HTMLElement>(`[data-ghost-id="${CSS.escape(ghost)}"]`)?.focus({ preventScroll: true }))
      return
    }
    if (!isMovable(drag.item)) return
    const unchanged = drag.start.getTime() === Date.parse(drag.item.starts_at!) && drag.end.getTime() === Date.parse(drag.item.ends_at!)
    if (unchanged) return
    if (ghost) onProposalMove?.(ghost, drag.start, drag.end)
    else onMove(drag.item, drag.start, drag.end)
  }

  // A to-do dragged in from Help me plan (native drag and drop).
  const dropMinute = (e: ReactDragEvent) => {
    const { dayIndex, minute } = pointAt(e.clientX, e.clientY)
    return { dayIndex, minute: clamp(snapDown(minute), 0, MINUTES_PER_DAY - SNAP_MIN) }
  }
  const handleDragOver = (e: ReactDragEvent) => {
    if (!incoming || !onDropIncoming) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const at = dropMinute(e)
    if (at.dayIndex !== dropAt?.dayIndex || at.minute !== dropAt.minute) setDropAt(at)
  }
  const handleDrop = (e: ReactDragEvent) => {
    if (!incoming || !onDropIncoming) return
    e.preventDefault()
    const at = dropMinute(e)
    setDropAt(null)
    onDropIncoming(atMinutes(days[at.dayIndex], at.minute))
  }
  const dropStart = incoming && dropAt ? atMinutes(days[dropAt.dayIndex], dropAt.minute) : null
  const dropPreview = incoming && dropStart
    ? layoutDays([{
        ...ghostRow({
          id: 'incoming', taskId: 'incoming', title: incoming.title, course: incoming.course,
          startsAt: dropStart.toISOString(),
          endsAt: new Date(dropStart.getTime() + incoming.durationMin * 60_000).toISOString(),
        }),
        occurrence_key: 'incoming',
      }], days)
    : null

  const createDraft = drag?.type === 'create' && drag.moved
    ? { dayIndex: drag.dayIndex, from: snap(Math.min(drag.fromMin, drag.toMin)), to: snap(Math.max(drag.fromMin, drag.toMin)) }
    : null
  const draggingKey = preview && drag?.type !== 'create' ? drag?.item.occurrence_key : undefined
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-item border border-border-subtle bg-surface-raised">
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
                data-day-column
                className={cn(
                  // Narrow columns (phone) stack the weekday over the date.
                  '@container flex min-h-11 min-w-0 items-center justify-center border-l border-border-subtle text-body',
                  isToday ? 'font-semibold text-accent' : 'text-text-secondary',
                )}
              >
                <div className="flex flex-col items-center gap-0.5 py-1 @[5.5rem]:flex-row @[5.5rem]:gap-1.5 @[5.5rem]:py-0">
                  <span>{formatWeekday(day)}</span>
                  <span
                    className={cn(
                      'flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 font-semibold tabular-nums',
                      isToday ? 'bg-accent text-accent-foreground' : 'text-text-primary',
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* All-day row: what's due */}
      {hasDue && (
        <div className="flex shrink-0 overflow-hidden border-b border-border-subtle [scrollbar-gutter:stable]">
          <div className={cn(GUTTER, 'flex shrink-0 items-start justify-end pr-2 pt-1.5 text-meta text-text-muted')}>
            Due
          </div>
          <div className="grid flex-1" style={cols}>
            {markers.map((dayMarkers, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-1 border-l border-border-subtle p-1">
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
                        '@container flex h-[22px] min-w-0 shrink-0 items-center gap-1.5 rounded-item px-2 text-left text-meta font-semibold transition-opacity',
                        tone.due,
                        opacityFor(isDimmed(m.item), m.item.status === 'done'),
                        isLinked(m.item) && 'ring-2 ring-accent',
                        activeKey === m.key && 'ring-2 ring-accent',
                      )}
                    >
                      {done ? <Check className="h-3 w-3 shrink-0" /> : <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.bar)} />}
                      <span className={cn('truncate', done && 'line-through opacity-70')}>{m.item.title}</span>
                      {!m.allDay && (
                        // The time gives way first in a narrow column; the title (and tooltip) stay.
                        <span className="ml-auto hidden shrink-0 font-normal tabular-nums opacity-85 @[6rem]:inline">{formatClock(new Date(m.item.due_at!))}</span>
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
                className="absolute right-2 -translate-y-1/2 text-meta tabular-nums text-text-muted"
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
            onDragOver={handleDragOver}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null)
            }}
            onDrop={handleDrop}
          >
            {/* Hour and half-hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: h * hourPx }}>
                {h > 0 && <div className="border-t border-border-subtle" />}
              </div>
            ))}

            {days.map((day, dayIndex) => {
              const isToday = sameDay(day, now)
              return (
                <div
                  key={day.toISOString()}
                  data-testid="calendar-day"
                  data-date={day.toISOString()}
                  className={cn('relative border-l border-border-subtle', startOfDay(day) < startOfDay(now) && 'bg-past')}
                >
                  {freeSegments?.[dayIndex].map((f) => {
                    const height = ((f.endMin - f.startMin) / 60) * hourPx - 4
                    return (
                      <div
                        key={f.key}
                        data-testid="calendar-free"
                        aria-hidden
                        className="pointer-events-none absolute inset-x-1 flex items-center justify-center overflow-hidden rounded-item border-[1.5px] border-dotted border-free-line text-meta text-text-muted"
                        style={{ top: (f.startMin / 60) * hourPx + 2, height: Math.max(0, height) }}
                      >
                        {height >= FREE_LABEL_PX && `${formatMinutes(f.endMin - f.startMin)} free`}
                      </div>
                    )
                  })}

                  {segments[dayIndex].map((seg) => ghostId(seg.item) ? (
                    <GhostBlock
                      key={seg.key}
                      seg={seg}
                      hourPx={hourPx}
                      saved={savedProposalIds?.has(ghostId(seg.item)!) ?? false}
                      lifted={draggingKey === seg.item.occurrence_key}
                      onPointerDown={(e, type) => startBlockDrag(e, seg.item, type)}
                      onAccept={() => onProposalAccept?.(ghostId(seg.item)!)}
                      onDismiss={() => onProposalDismiss?.(ghostId(seg.item)!)}
                      onNudge={(minutes, dayShift) => onProposalNudge?.(ghostId(seg.item)!, minutes, dayShift)}
                    />
                  ) : (
                    <Block
                      key={revealed?.key === seg.key ? `${seg.key}:${revealed.requestId}` : seg.key}
                      seg={seg}
                      hourPx={hourPx}
                      dimmed={isDimmed(seg.item)}
                      linked={isLinked(seg.item)}
                      active={activeKey === seg.item.occurrence_key}
                      lifted={draggingKey === seg.item.occurrence_key}
                      glow={revealed?.key === seg.key}
                      onPointerDown={(e, type) => startBlockDrag(e, seg.item, type)}
                      onKeyOpen={(anchor) => onOpen(seg.item, anchor)}
                    />
                  ))}

                  {segments[dayIndex].filter((seg) => revealed?.key === seg.key).map((seg) => (
                    <RevealCallout
                      key={`callout:${revealed!.requestId}`}
                      item={seg.item}
                      top={(seg.endMin / 60) * hourPx + 6}
                      alignRight={days.length > 1 && dayIndex >= days.length - 2}
                    />
                  ))}

                  {markers[dayIndex].filter((m) => !m.allDay).map((m) => (
                    <div
                      key={m.key}
                      className="pointer-events-none absolute inset-x-0 flex items-center"
                      style={{ top: (m.minute / 60) * hourPx - 1 }}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', toneFor(m.item.course).bar, isDimmed(m.item) && 'opacity-40')} />
                      <span className={cn('h-px flex-1', toneFor(m.item.course).bar, isDimmed(m.item) ? 'opacity-20' : 'opacity-50')} />
                    </div>
                  ))}

                  {preview?.[dayIndex].map((seg) => (
                    <Block key={seg.key} seg={seg} hourPx={hourPx} preview />
                  ))}

                  {dropPreview?.[dayIndex].map((seg) => (
                    <div
                      key={seg.key}
                      data-testid="calendar-drop-preview"
                      className="pointer-events-none absolute inset-x-1 z-30 rounded-item bg-accent-soft ring-2 ring-accent"
                      style={{ top: (seg.startMin / 60) * hourPx + 1, height: blockHeight(seg, hourPx) }}
                    >
                      <span className="block truncate px-2 py-0.5 text-meta font-semibold text-accent">
                        {incoming?.title} · {formatSpan(new Date(seg.item.starts_at!), new Date(seg.item.ends_at!))}
                      </span>
                    </div>
                  ))}

                  {createDraft?.dayIndex === dayIndex && createDraft.to > createDraft.from && (
                    <div
                      data-testid="calendar-draft"
                      className="pointer-events-none absolute inset-x-1 rounded-item bg-accent-soft ring-1 ring-inset ring-accent-line"
                      style={{ top: (createDraft.from / 60) * hourPx, height: ((createDraft.to - createDraft.from) / 60) * hourPx }}
                    >
                      <span className="block px-2 py-0.5 text-meta font-semibold tabular-nums text-accent">
                        {formatSpan(atMinutes(day, createDraft.from), atMinutes(day, createDraft.to))}
                      </span>
                    </div>
                  )}

                  {isToday && (
                    <div
                      data-testid="calendar-now"
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      style={{ top: (wallMinutes(now) / 60) * hourPx - 5 }}
                    >
                      <span className="-ml-[5px] h-2.5 w-2.5 shrink-0 rounded-full bg-confused" />
                      <span className="h-0.5 flex-1 bg-confused" />
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
  /** Just revealed ("See it"): glows once in its course colour. */
  glow?: boolean
  onPointerDown?: (e: ReactPointerEvent, type: 'move' | 'resize') => void
  onKeyOpen?: (anchor: Anchor) => void
}

function Block({ seg, hourPx, dimmed, linked, active, lifted, preview, glow, onPointerDown, onKeyOpen }: BlockProps) {
  const { item } = seg
  const tone = toneFor(item.course)
  const isCommitment = item.kind === 'commitment'
  const movable = isMovable(item)
  const done = item.status === 'done'
  const top = (seg.startMin / 60) * hourPx
  // Short blocks (a 20-minute review) keep a legible one-line title; the
  // time is in the tooltip and the accessible name.
  const height = blockHeight(seg, hourPx)
  const compact = height < COMPACT_BLOCK_PX
  const roomy = height >= 38
  const start = new Date(item.starts_at!)
  const end = new Date(item.ends_at!)
  const fromMoment = item.source_type === 'recording' && item.source_id != null
  const kindLabel = isCommitment ? (item.subtype ?? 'Fixed') : 'Study time'
  const look = blockLook(item)
  const twoLines = height >= TWO_LINE_TITLE_PX

  return (
    <div
      role={preview ? undefined : 'button'}
      tabIndex={preview ? undefined : 0}
      data-block={item.kind}
      data-testid={preview ? 'calendar-block-preview' : 'calendar-block'}
      data-kind={item.kind}
      data-look={look}
      data-dimmed={dimmed || undefined}
      data-linked={linked || undefined}
      data-revealed={glow || undefined}
      aria-label={`${item.title}, ${kindLabel.toLowerCase()}, ${formatSpan(start, end)}${done ? ', done' : ''}`}
      title={`${item.title}, ${formatSpan(start, end)}${isCommitment ? ' - fixed, open to edit' : movable ? ' - drag to move' : ''}`}
      onPointerDown={preview ? undefined : (e) => onPointerDown?.(e, 'move')}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onKeyOpen?.({ clientX: rect.right, clientY: rect.top })
      }}
      className={cn(
        'group absolute rounded-item text-left outline-none transition-[opacity,box-shadow] duration-150',
        // A compact block's one line may overhang its box rather than be cut.
        compact ? 'z-[5] overflow-visible' : 'overflow-hidden',
        isCommitment ? tone.commitment : tone.study,
        'focus-visible:ring-2 focus-visible:ring-accent',
        movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        seg.continuesBefore && 'rounded-t-none',
        seg.continuesAfter && 'rounded-b-none',
        opacityFor(dimmed, done),
        linked && 'ring-2 ring-accent shadow-[0_0_0_4px_var(--color-accent-soft)]',
        active && 'ring-2 ring-accent',
        lifted && 'opacity-30',
        preview && 'pointer-events-none z-30 shadow-pop ring-2 ring-accent',
        glow && 'z-20 motion-safe:animate-glow-once motion-reduce:glow-ring',
      )}
      style={{
        ...(glow ? ({ '--glow': courseTone(item.course).solid } as CSSProperties) : {}),
        top: top + 1,
        height,
        left: `calc(${(seg.column / seg.columns) * 100}% + 2px)`,
        width: `calc(${100 / seg.columns}% - 4px)`,
      }}
    >
      {!isCommitment && <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', tone.bar, compact && 'rounded-l-item')} />}
      <div className={cn('relative flex h-full min-w-0 flex-col pr-1.5', isCommitment ? 'pl-2' : 'pl-[11px]', roomy ? 'py-1' : 'justify-center')}>
        <div className="flex min-w-0 shrink-0 items-start gap-1">
          {done && <Check className="mt-px h-3 w-3 shrink-0" />}
          {item.subtype === 'shift' && <Coffee data-testid="calendar-shift-icon" className="mt-px h-3 w-3 shrink-0" aria-hidden />}
          <span
            data-testid="calendar-block-title"
            className={cn('min-w-0 flex-1 text-meta font-semibold', compact ? 'leading-none' : 'leading-tight', twoLines ? 'line-clamp-2' : 'truncate', done && 'line-through')}
          >
            {item.title}
          </span>
          {fromMoment && <AudioLines className="mt-px h-3 w-3 shrink-0" aria-hidden />}
          {item.recurrence && <Repeat className="mt-px h-3 w-3 shrink-0 opacity-85" aria-hidden />}
          {movable && !done && !preview && (
            // Study time can move: a grab handle says so.
            <GripVertical data-testid="calendar-grip" className="mt-px h-3 w-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
          )}
        </div>
        {roomy && (
          <span className="shrink-0 truncate text-meta tabular-nums leading-tight opacity-85">
            {formatSpan(start, end)}
          </span>
        )}
      </div>
      {movable && !preview && (
        <div
          data-testid="calendar-block-resize"
          aria-hidden
          onPointerDown={(e) => onPointerDown?.(e, 'resize')}
          className="absolute inset-x-0 bottom-0 flex cursor-ns-resize items-end justify-center opacity-0 transition-opacity group-hover:opacity-100"
          // A third of a short block at most, so most of it still moves the block.
          style={{ height: Math.min(8, Math.floor(height / 3)) }}
        >
          <span className="mb-0.5 h-0.5 w-6 rounded-full bg-current opacity-50" />
        </div>
      )}
    </div>
  )
}

/** Free intervals cut into per-day spans (wall-clock minutes) for shading. */
function shadeDays(intervals: ReadonlyArray<{ start: number; end: number }>, days: Date[]) {
  return days.map((day, dayIndex) => {
    const dayStart = startOfDay(day).getTime()
    const nextDay = addDays(day, 1).getTime()
    return intervals
      .filter((i) => i.end > dayStart && i.start < nextDay)
      .map((i) => {
        const end = Math.min(i.end, nextDay)
        return {
          key: `${dayIndex}:${i.start}`,
          startMin: wallMinutes(new Date(Math.max(i.start, dayStart))),
          endMin: end === nextDay ? MINUTES_PER_DAY : wallMinutes(new Date(end)),
        }
      })
  })
}

interface GhostBlockProps {
  seg: DaySegment
  hourPx: number
  /** Accepted and saving: drawn until the real block arrives. */
  saved: boolean
  lifted: boolean
  onPointerDown: (e: ReactPointerEvent, type: 'move' | 'resize') => void
  onAccept: () => void
  onDismiss: () => void
  /** Keyboard adjust: arrows move by 15 minutes (up / down) or a day (left / right). */
  onNudge: (minutes: number, days: number) => void
}

/**
 * A drafted, unsaved block. Visibly not real yet (hatched, dashed edge), draggable to adjust, with its own accept and dismiss.
 */
function GhostBlock({ seg, hourPx, saved, lifted, onPointerDown, onAccept, onDismiss, onNudge }: GhostBlockProps) {
  const { item } = seg
  const tone = toneFor(item.course)
  const start = new Date(item.starts_at!)
  const end = new Date(item.ends_at!)
  const top = (seg.startMin / 60) * hourPx
  // Drawn to scale like a block; a short one shows its accept and dismiss
  // buttons over it on hover or focus, overhanging rather than cut.
  const height = blockHeight(seg, hourPx)
  const compact = height < COMPACT_BLOCK_PX
  const roomy = height >= 52
  const span = formatSpan(start, end)
  const stop = (e: ReactPointerEvent) => e.stopPropagation()
  const iconButton = 'flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <div
      data-block="ghost"
      data-testid="calendar-ghost"
      data-ghost-id={ghostId(item) ?? undefined}
      data-look="ghost"
      data-saved={saved || undefined}
      aria-label={`Suggested: ${item.title}, ${span}`}
      aria-description={saved ? undefined : 'Arrow keys move it, Enter accepts, Delete dismisses'}
      tabIndex={saved ? undefined : 0}
      onKeyDown={saved ? undefined : (e) => {
        if (e.target !== e.currentTarget) return
        const keys: Record<string, () => void> = {
          ArrowUp: () => onNudge(-SNAP_MIN, 0),
          ArrowDown: () => onNudge(SNAP_MIN, 0),
          ArrowLeft: () => onNudge(0, -1),
          ArrowRight: () => onNudge(0, 1),
          Enter: onAccept,
          Delete: onDismiss,
          Backspace: onDismiss,
        }
        const action = keys[e.key]
        if (!action) return
        e.preventDefault()
        action()
      }}
      title={saved ? `${item.title}, ${span} - saving` : `Suggested: ${item.title}, ${span} - drag to adjust`}
      onPointerDown={saved ? undefined : (e) => onPointerDown(e, 'move')}
      className={cn(
        'group absolute rounded-item text-left outline-none focus-visible:ring-2 focus-visible:ring-accent',
        compact ? 'z-[15] overflow-visible hover:z-20 focus-within:z-20' : 'z-10 overflow-hidden',
        tone.ghost,
        'transition-[opacity,box-shadow] duration-200',
        saved ? 'cursor-default opacity-70' : 'cursor-grab hover:shadow-[0_0_0_3px_var(--color-accent-soft)] active:cursor-grabbing',
        seg.continuesBefore && 'rounded-t-none',
        seg.continuesAfter && 'rounded-b-none',
        lifted && 'opacity-30',
      )}
      style={{
        top: top + 1,
        height,
        left: `calc(${(seg.column / seg.columns) * 100}% + 2px)`,
        width: `calc(${100 / seg.columns}% - 4px)`,
      }}
    >
      <div className={cn('relative flex h-full min-w-0 flex-col pl-2 pr-1', roomy ? 'py-1' : 'justify-center')}>
        <span className={cn('min-w-0 shrink-0 text-meta font-semibold', compact ? 'leading-none' : 'leading-tight', height >= TWO_LINE_TITLE_PX + GHOST_BUTTONS_PX ? 'line-clamp-2' : 'truncate')}>{item.title}</span>
        {roomy && (
          <span className="shrink-0 truncate text-meta tabular-nums leading-tight opacity-85">
            {saved ? 'Saving...' : span}
          </span>
        )}
        {!saved && (
          // Bottom right when there is room; over the title on hover / focus in a short block.
          <div
            className={cn(
              'flex gap-1',
              roomy
                ? 'mt-auto justify-end pb-0.5'
                : 'absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-surface-raised p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 focus-within:opacity-100',
            )}
          >
              <button
                type="button"
                aria-label={`Accept ${item.title}`}
                title="Accept"
                onPointerDown={stop}
                onClick={onAccept}
                className={cn(iconButton, 'bg-accent text-accent-foreground hover:opacity-90')}
              >
                <Check className="h-2.5 w-2.5" />
              </button>
              <button
                type="button"
                aria-label={`Dismiss ${item.title}`}
                title="Dismiss"
                onPointerDown={stop}
                onClick={onDismiss}
                className={cn(iconButton, 'bg-surface-raised text-text-secondary ring-1 ring-border hover:bg-surface-overlay hover:text-text-primary')}
              >
                <X className="h-2.5 w-2.5" />
              </button>
          </div>
        )}
      </div>
      {/* No edge to resize on a compact draft: on touch it would catch the taps meant for Accept (drag it, or use the keyboard). */}
      {!saved && !compact && (
        <div
          aria-hidden
          onPointerDown={(e) => onPointerDown(e, 'resize')}
          className="absolute inset-x-0 bottom-0 flex cursor-ns-resize items-end justify-center opacity-0 transition-opacity group-hover:opacity-100"
          style={{ height: Math.min(8, Math.floor(height / 3)) }}
        >
          <span className="mb-0.5 h-0.5 w-6 rounded-full bg-current opacity-50" />
        </div>
      )}
    </div>
  )
}
