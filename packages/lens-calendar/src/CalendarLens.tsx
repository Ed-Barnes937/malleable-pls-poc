import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_STUDY_MIN_PER_DAY, openTime, weekLayout, type PlanItemOccurrence } from '@pls/substrate'
import { type LensProps, type DateRange, useMissedBlocks, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, cn, courseTone, useNarrowScreen } from '@pls/shared-ui'
import { ChevronLeft, ChevronRight, Plus, Sparkles, X } from 'lucide-react'
import { TimeGrid, type Anchor, type Reveal } from './TimeGrid'
import { EventPopover } from './EventPopover'
import type { PendingAction } from './pending'
import { StudyBlockPopover, type MomentState } from './StudyBlockPopover'
import { markClosingPress } from './popover-position'
import { HelpMePlanButton, HelpMePlanPanel, ScheduleClash, type DraggedTodo } from './HelpMePlan'
import { ProposalTray } from './ProposalTray'
import { REFIT_SOURCE, RefitBanner, useRefitDraft } from './RefitBanner'
import { acceptPatch, useProposalLayer, type ProposalValidator } from './proposals'
import type { AutofillState } from './autofill'
import { draftFromRow, movePatch, newItemFromDraft, patchFromDraft, type Draft } from './drafts'
import { toneFor } from './colors'
import { addDays, formatFullDay, formatRangeTitle, localTimeZone, startOfDay, startOfWeek } from './time'
import { PLAN_PANEL_PX, planPanelPlacement, useWeekGeometry } from './plan-panel'

type View = 'week' | 'day'

type Popover =
  | { mode: 'create'; x: number; y: number; draft: Draft }
  /**
   * A block from a lecture moment opens on where it came from; `editingTime`
   * swaps that for the date and time pickers.
   */
  | { mode: 'edit'; x: number; y: number; key: string; moment?: MomentState; editingTime?: boolean }

/** A drag the server hasn't confirmed yet, shown until fresher data arrives. */
interface PendingMove {
  starts_at: string
  ends_at: string
  /** The row's `updated_at` when dragged: newer data supersedes the override. */
  basis: string
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** A block made from a lecture moment (provenance `source_type = 'recording'`). */
function fromMoment(item: PlanItemOccurrence): boolean {
  return item.source_type === 'recording' && !!item.source_id
}

function courseLabel(course: string): string {
  return COURSES.find((c) => c.value === course)?.label ?? course
}

export default function CalendarLens({ highlight, config, onConfigChange, onShowMoment, onEditAutomation, focusedPlanItem, onPlanItemShown }: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()
  const createItem = mutations.useCreatePlanItem()
  const updateItem = mutations.useUpdatePlanItem()
  const completeItem = mutations.useCompletePlanItem()
  const deleteItem = mutations.useDeletePlanItem()

  const now = useNow()
  const narrow = useNarrowScreen()
  const savedView: View = config.view === 'day' ? 'day' : 'week'
  // A phone opens in Day view: seven columns don't fit.
  const [view, setViewState] = useState<View>(() => (narrow ? 'day' : savedView))
  const [anchorDay, setAnchorDay] = useState(() => startOfDay(new Date()))
  const [popover, setPopover] = useState<Popover | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Map<string, PendingMove>>(new Map())
  const [planOpen, setPlanOpen] = useState(false)
  /** In a narrow calendar the panel overlays the grid: the student can tuck it away to see the ghosts. */
  const [planCollapsed, setPlanCollapsed] = useState(false)
  /** Auto-fill's draft (note, trims, what didn't fit), kept here so closing the panel keeps it. */
  const [autofill, setAutofill] = useState<AutofillState>({ state: 'idle' })
  // Layer-2 knob: how much study Help me plan fills into a day.
  const [studyMinPerDay, setStudyMinPerDay] = useState(() =>
    typeof config.studyMinPerDay === 'number' && config.studyMinPerDay > 0 ? config.studyMinPerDay : DEFAULT_STUDY_MIN_PER_DAY,
  )
  /** A to-do being dragged from Help me plan onto the grid. */
  const [incoming, setIncoming] = useState<DraggedTodo | null>(null)
  /** A calm note in the header, e.g. a move that didn't save. */
  const [notice, setNotice] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const planButtonRef = useRef<HTMLButtonElement>(null)
  /** What had focus when the popover opened, to return focus to on close. */
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const openPopover = (next: Popover) => {
    const active = document.activeElement
    openerRef.current = active instanceof HTMLElement && rootRef.current?.contains(active) ? active : null
    setError(null)
    setNotice(null)
    setPopover(next)
  }
  const closePopover = useCallback(() => {
    setPopover(null)
    const opener = openerRef.current
    openerRef.current = null
    if (!opener?.isConnected) return
    requestAnimationFrame(() => {
      // Focus goes back to what opened the popover, unless the press that
      // closed it put focus on something else in the calendar (another
      // block and maybe its popover, a button), which keeps it.
      const active = document.activeElement
      const elsewhere = active && active !== document.body && rootRef.current?.contains(active)
      if (!elsewhere) opener.focus()
    })
  }, [])
  /**
   * A press anywhere in the calendar but the popover closes it and still
   * does what it does, so a block can be dragged (or opened) straight away.
   * A press on empty time only closes it (`closedPopover` in TimeGrid).
   * Presses outside the calendar leave it open, e.g. while the student
   * edits the automation its footer opened.
   */
  const closeOnPressAway = (e: ReactPointerEvent) => {
    if (!popover || (e.target as Element).closest?.('[data-calendar-popover]')) return
    markClosingPress(e.nativeEvent)
    closePopover()
  }

  const setView = (next: View) => {
    setViewState(next)
    if (next !== 'week') setPlanOpen(false)
    // A view picked on a phone stays on the phone: the saved view is the wide screen's.
    if (!narrow) onConfigChange?.({ view: next })
  }

  // Crossing the phone width (a rotated tablet, a resized window): Day view
  // when narrow, the saved view again when wide.
  const wasNarrow = useRef(narrow)
  useEffect(() => {
    if (wasNarrow.current === narrow) return
    wasNarrow.current = narrow
    setViewState(narrow ? 'day' : savedView)
    if (narrow) setPlanOpen(false)
  }, [narrow, savedView])

  const days = useMemo(() => {
    if (view === 'day') return [anchorDay]
    const monday = startOfWeek(anchorDay)
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  }, [view, anchorDay])
  const range: DateRange = useMemo(
    () => ({ from: days[0].toISOString(), to: addDays(days[days.length - 1], 1).toISOString() }),
    [days],
  )

  // A block another widget asked to show ("See it" on a new review): open
  // its week (or day), then the grid scrolls to it and it glows once.
  const [reveal, setReveal] = useState<Reveal | null>(null)
  useEffect(() => {
    if (!focusedPlanItem) return
    const day = startOfDay(new Date(focusedPlanItem.startsAt))
    setAnchorDay((current) => {
      const shown = view === 'day' ? current : startOfWeek(current)
      const until = view === 'day' ? addDays(current, 1) : addDays(startOfWeek(current), 7)
      return day >= shown && day < until ? current : day
    })
    setReveal({
      id: focusedPlanItem.id,
      requestId: focusedPlanItem.requestId,
      requestedAt: focusedPlanItem.requestedAt,
      keepInView: focusedPlanItem.keepInView,
      landsInMs: focusedPlanItem.landsInMs,
    })
    onPlanItemShown?.(focusedPlanItem.requestId)
  }, [focusedPlanItem, onPlanItemShown, view])

  // Never pass `highlight` here: the calendar shows every course's
  // commitments and only dims the ones outside the board's course.
  const { data, isLoading } = substrate.usePlanItems({ from: range.from, to: range.to, statuses: ['open', 'done'] })
  // Open to-dos with no time yet: what Help me plan offers, and what an
  // Auto-fill ghost's to-do must still be when it is accepted.
  const { data: todoData } = substrate.usePlanItems({ kinds: ['task'], statuses: ['open'], scheduled: false })

  /**
   * To-dos being given a time by hand (a suggested slot, a drop, Pick a
   * time), until the saved block arrives: already on the grid and busy for
   * Help me plan, and no longer waiting for a time, so an Auto-fill started
   * meanwhile drafts around them rather than over them.
   */
  const [assigning, setAssigning] = useState<ReadonlyMap<string, PlanItemOccurrence>>(new Map())

  const items = useMemo(() => {
    const rows = (data ?? []) as PlanItemOccurrence[]
    const moved = pending.size === 0 ? rows : rows.map((r) => {
      const p = pending.get(r.occurrence_key)
      return p && p.basis === r.updated_at ? { ...r, starts_at: p.starts_at, ends_at: p.ends_at } : r
    })
    const extra = [...assigning.values()].filter((a) => !moved.some((r) => r.id === a.id && r.starts_at))
    return extra.length ? [...moved, ...extra] : moved
  }, [data, pending, assigning])

  // An assignment is done once its block is in the week's rows and the to-do
  // has left the unscheduled list.
  useEffect(() => {
    if (assigning.size === 0 || !data || !todoData) return
    const shown = (at: string) => Date.parse(at) >= Date.parse(range.from) && Date.parse(at) < Date.parse(range.to)
    const landed = [...assigning].filter(([id, at]) =>
      (!shown(at.starts_at!) || (data as PlanItemOccurrence[]).some((r) => r.id === id && r.starts_at != null && Date.parse(r.starts_at) === Date.parse(at.starts_at!)))
      && !(todoData as PlanItemOccurrence[]).some((t) => t.id === id))
    if (landed.length === 0) return
    setAssigning((prev) => {
      const next = new Map(prev)
      for (const [id] of landed) next.delete(id)
      return next
    })
  }, [assigning, data, todoData, range])

  // Drop overrides once fresher rows arrive.
  useEffect(() => {
    if (pending.size === 0 || !data) return
    const stale = [...pending].filter(([key, p]) => {
      const r = (data as PlanItemOccurrence[]).find((row) => row.occurrence_key === key)
      return !r || r.updated_at !== p.basis
    })
    if (stale.length === 0) return
    setPending((prev) => {
      const next = new Map(prev)
      for (const [key] of stale) next.delete(key)
      return next
    })
  }, [data, pending])

  const todos = useMemo(
    () => (todoData ? (todoData as PlanItemOccurrence[]).filter((t) => !assigning.has(t.id)) : null),
    [todoData, assigning],
  )

  /** The block a study block for `taskId` at [start, end) would overlap (commitments and other study time). */
  const clashAt = useCallback(
    (taskId: string, start: number, end: number) =>
      items.find((r) =>
        r.id !== taskId && r.status !== 'dismissed' && r.kind !== 'deadline' && r.starts_at && r.ends_at
        && Date.parse(r.starts_at) < end && start < Date.parse(r.ends_at)) ?? null,
    [items],
  )

  // Study blocks whose time passed without being done, offered for re-fitting.
  const missed = useMissedBlocks()
  const refit = useRefitDraft(missed)
  const missedIds = useMemo(() => (missed.preview ? new Set(missed.preview.map((m) => m.item.id)) : null), [missed.preview])

  const validateProposal: ProposalValidator = useCallback((p, source) => {
    if (source === 'autofill' && todos && !todos.some((t) => t.id === p.taskId)) return 'it already has a time'
    if (source === REFIT_SOURCE) {
      if (missedIds && !missedIds.has(p.taskId)) return 'it was already moved, done or removed'
      if (Date.parse(p.startsAt) < Date.now()) return 'that time has already started'
    }
    const clash = clashAt(p.taskId, Date.parse(p.startsAt), Date.parse(p.endsAt))
    return clash ? `that time overlaps ${clash.title}` : null
  }, [todos, clashAt, missedIds])

  // Ghost blocks (Auto-fill drafts, re-fitted blocks): client state until
  // accepted. An Auto-fill ghost saves like a drag would; re-fitted ones are
  // written together by `planItems.refit`, which refuses a stale preview.
  // Each is checked against the calendar as it is now, so a ghost never
  // lands on something.
  const layer = useProposalLayer({
    save: (p) => updateItem.mutateAsync({ id: p.taskId, patch: acceptPatch(p) }),
    saveTogether: { [REFIT_SOURCE]: refit.save },
    onDismiss: refit.onDismiss,
    rows: items,
    validate: validateProposal,
  })
  // The layer's notes ("Took ... out", "Didn't save ...") show in the header like any other.
  useEffect(() => {
    if (!layer.notice) return
    setNotice(layer.notice)
    layer.clearNotice()
  }, [layer])

  // Help me plan works on the week shown, around every course's commitments.
  const timeZone = useMemo(() => localTimeZone(), [])
  const planLayout = useMemo(
    () => (planOpen && view === 'week'
      ? weekLayout(items, { start: Date.parse(range.from), end: Date.parse(range.to) }, { timeZone, studyMinPerDay })
      : null),
    [planOpen, view, items, range, timeZone, studyMinPerDay],
  )
  // Free gaps around drafted blocks too, so a gap's "2h free" is what is still open.
  const freeTime = useMemo(
    () => (planLayout
      ? openTime(planLayout, now.getTime(), layer.proposals.map((p) => ({ start: Date.parse(p.startsAt), end: Date.parse(p.endsAt) })))
      : undefined),
    [planLayout, now, layer.proposals],
  )
  // Where the panel floats: over the days already past, else the weekend,
  // never over a draft (see plan-panel.ts).
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const geometry = useWeekGeometry(gridAreaRef, !!planLayout, range.from)
  const pastDays = days.filter((d) => d.getTime() < startOfDay(now).getTime()).length
  const draftDays = layer.proposals
    .filter((p) => !layer.savedIds.has(p.id))
    .map((p) => days.findIndex((d) => d.getTime() === startOfDay(new Date(p.startsAt)).getTime()))
    .filter((i) => i >= 0)
  const placement = geometry ? planPanelPlacement(geometry, pastDays, draftDays) : { side: 'right' as const, width: PLAN_PANEL_PX }
  const thisWeek = startOfWeek(now).getTime()
  const weekLabel = days[0].getTime() === thisWeek ? 'this week'
    : days[0].getTime() === addDays(new Date(thisWeek), 7).getTime() ? 'next week' : 'that week'

  /**
   * Assigning a to-do by hand (suggested slot, drop, or a picked time) saves
   * its block straight away, unless it would land on a commitment or other
   * study time: then nothing is saved and the promise rejects saying why.
   */
  const scheduleTodo = async (todo: { id: string; title: string }, start: Date, durationMin: number) => {
    const end = start.getTime() + durationMin * 60_000
    const clash = clashAt(todo.id, start.getTime(), end)
    if (clash) throw new ScheduleClash(`"${todo.title}" would overlap ${clash.title} there. Pick a free time.`)
    const patch = { starts_at: start.toISOString(), ends_at: new Date(end).toISOString(), duration_min: durationMin }
    const row = todos?.find((t) => t.id === todo.id)
    if (row) setAssigning((prev) => new Map(prev).set(todo.id, { ...row, ...patch, occurrence_key: todo.id }))
    try {
      await updateItem.mutateAsync({ id: todo.id, patch })
    } catch (e) {
      setAssigning((prev) => {
        const next = new Map(prev)
        next.delete(todo.id)
        return next
      })
      throw e
    }
  }

  const isDimmed = useCallback(
    // Only other courses dim: items with no course (a shift) stay as they are.
    (item: PlanItemOccurrence) => !!highlight?.courseTag && item.course != null && item.course !== highlight.courseTag,
    [highlight?.courseTag],
  )
  const isLinked = useCallback(
    (item: PlanItemOccurrence) =>
      !!highlight?.recordingId && item.source_type === 'recording' && item.source_id === highlight.recordingId,
    [highlight?.recordingId],
  )

  const relative = (anchor: Anchor) => {
    const rect = rootRef.current?.getBoundingClientRect()
    return { x: anchor.clientX - (rect?.left ?? 0), y: anchor.clientY - (rect?.top ?? 0) }
  }

  /**
   * "Go to moment": the shell shows it in this board's Transcript, or switches
   * to a board that has one (and says so with a way back).
   */
  const showMoment = async (item: PlanItemOccurrence, key: string) => {
    if (!onShowMoment || item.source_id == null) return
    setPopover((p) => (p?.mode === 'edit' && p.key === key ? { ...p, moment: 'opening' } : p))
    let moment: MomentState
    try {
      const result = await onShowMoment({ recordingId: item.source_id, offsetMs: item.source_offset_ms ?? 0 })
      moment = result === 'no-viewer' ? 'nowhere' : result
    } catch {
      moment = 'failed'
    }
    setPopover((p) => (p?.mode === 'edit' && p.key === key ? { ...p, moment } : p))
  }

  const handleOpen = (item: PlanItemOccurrence, anchor: Anchor) => {
    openPopover({ mode: 'edit', ...relative(anchor), key: item.occurrence_key })
  }

  const handleCreate = (start: Date, end: Date, anchor: Anchor) => {
    openPopover({
      mode: 'create',
      ...relative(anchor),
      draft: { kind: 'commitment', title: '', start, end, course: highlight?.courseTag ?? null, repeatsWeekly: false },
    })
  }

  const handleMove = (item: PlanItemOccurrence, start: Date, end: Date) => {
    const patch = movePatch(item, start, end)
    if (Object.keys(patch).length === 0) return
    setPending((prev) => new Map(prev).set(item.occurrence_key, {
      starts_at: start.toISOString(), ends_at: end.toISOString(), basis: item.updated_at,
    }))
    setNotice(null)
    updateItem.mutateAsync({ id: item.id, patch }).catch(() => {
      // Never snap back silently: say the move didn't stick.
      setNotice(`Couldn't move "${item.title}" - it's back where it was. Try again?`)
      setPending((prev) => {
        const next = new Map(prev)
        next.delete(item.occurrence_key)
        return next
      })
    })
  }

  /** Which popover is open, so a save that lands after it closed doesn't touch the next one. */
  const popoverId = popover ? (popover.mode === 'create' ? `create-${popover.draft.start.toISOString()}` : `edit-${popover.key}`) : null
  const popoverIdRef = useRef(popoverId)
  useEffect(() => { popoverIdRef.current = popoverId }, [popoverId])
  /** The popover action waiting on the server: its button says so ("Saving...") until the save lands. */
  const [pendingSave, setPendingSave] = useState<{ popover: string | null; kind: PendingAction } | null>(null)
  const popoverPending = pendingSave && pendingSave.popover === popoverId ? pendingSave.kind : null
  /** A save that failed after its popover closed (Escape mid-save): said above the grid instead. */
  const [lostSave, setLostSave] = useState<string | null>(null)
  const run = async (kind: PendingAction, failed: string, action: () => Promise<unknown>) => {
    const started = popoverIdRef.current
    setError(null)
    setLostSave(null)
    setPendingSave({ popover: started, kind })
    try {
      await action()
      if (popoverIdRef.current === started) closePopover()
    } catch (e) {
      if (popoverIdRef.current === started) {
        setError(e instanceof Error && e.message ? `Couldn't save: ${e.message}` : "Couldn't save - try again")
      } else {
        setLostSave(`${failed} Try again.`)
      }
    } finally {
      setPendingSave(null)
    }
  }

  const editing = popover?.mode === 'edit' ? items.find((r) => r.occurrence_key === popover.key) : undefined
  // A deleted or moved-away row closes its popover.
  useEffect(() => {
    if (popover?.mode === 'edit' && data && !editing) setPopover(null)
  }, [popover, data, editing])

  const step = view === 'week' ? 7 : 1
  const phoneDay = narrow && view === 'day'
  const today = startOfDay(now)
  const showingToday = days.some((d) => d.getTime() === today.getTime())
  const busy = createItem.isPending || updateItem.isPending || completeItem.isPending || deleteItem.isPending
  const bounds = { width: rootRef.current?.clientWidth ?? 800, height: rootRef.current?.clientHeight ?? 600 }

  /** Keyboard (and pointer) way to add: an hour from the next half hour today, or 09:00 on the first day shown. */
  const handleAddButton = (e: MouseEvent<HTMLButtonElement>) => {
    const day = showingToday ? today : days[0]
    const start = new Date(day)
    if (showingToday) {
      const next = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30
      start.setMinutes(Math.min(next, 23 * 60))
    } else {
      start.setHours(9)
    }
    const rect = e.currentTarget.getBoundingClientRect()
    handleCreate(start, new Date(start.getTime() + 60 * 60_000), { clientX: rect.right, clientY: rect.bottom + 8 })
  }

  const stepButton = (dir: -1 | 1, size: string) => {
    const label = `${dir < 0 ? 'Previous' : 'Next'} ${view === 'week' ? 'week' : 'day'}`
    const Icon = dir < 0 ? ChevronLeft : ChevronRight
    return (
      <button type="button" aria-label={label} title={label} onClick={() => setAnchorDay((d) => addDays(d, dir * step))} className={cn(navButton, size)}>
        <Icon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div ref={rootRef} data-testid="calendar" className="relative flex h-full min-h-0 flex-col gap-3" onPointerDownCapture={closeOnPressAway}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2">
        {phoneDay ? (
          // Phone: the day in the middle, a step either side.
          <div className="flex w-full items-center gap-2">
            {stepButton(-1, 'h-9 w-10')}
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <h2 data-testid="calendar-title" className="max-w-full truncate text-title font-semibold text-text-primary">
                {formatFullDay(anchorDay)}
              </h2>
              {showingToday ? (
                <span className="text-meta text-text-muted">Today</span>
              ) : (
                <button type="button" onClick={() => setAnchorDay(today)} className="text-meta font-semibold text-accent hover:underline">
                  Back to today
                </button>
              )}
            </div>
            {stepButton(1, 'h-9 w-10')}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {stepButton(-1, 'h-8 w-8')}
              <button
                type="button"
                onClick={() => setAnchorDay(today)}
                disabled={showingToday && view === 'day'}
                className={cn(navButton, 'h-8 px-2.5')}
              >
                Today
              </button>
              {stepButton(1, 'h-8 w-8')}
            </div>

            <h2 data-testid="calendar-title" className="ml-1 min-w-0 truncate text-heading font-semibold text-text-primary">
              {formatRangeTitle(days[0], days[days.length - 1])}
            </h2>
          </>
        )}

        {highlight?.courseTag && (
          <span
            data-testid="calendar-highlight"
            className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-meta font-semibold', courseTone(highlight.courseTag).soft, courseTone(highlight.courseTag).ink)}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', toneFor(highlight.courseTag).bar)} />
            {courseLabel(highlight.courseTag)} highlighted
          </span>
        )}

        {notice && (
          <span role="status" data-testid="calendar-notice" className="text-meta text-text-secondary">{notice}</span>
        )}
        {!notice && !isLoading && items.length === 0 && (
          <span className="text-meta text-text-muted">Nothing planned. Click or drag on the grid to add something.</span>
        )}

        <div className={cn('flex flex-wrap items-center gap-2', phoneDay ? 'w-full justify-between' : 'ml-auto')}>
          <div role="tablist" aria-label="Calendar view" className="flex rounded-control bg-surface-overlay p-[3px]">
            {(['week', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'inline-flex h-[30px] items-center rounded-item px-3 text-body transition-colors',
                  view === v ? 'bg-surface-raised font-semibold text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {v === 'week' ? 'Week' : 'Day'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddButton}
            aria-label="Add to calendar"
            title="Add to calendar"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-border bg-surface-raised px-3.5 text-body font-medium whitespace-nowrap text-text-primary transition-colors hover:bg-surface-overlay"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
          {view === 'week' && (
            <HelpMePlanButton
              buttonRef={planButtonRef}
              open={planOpen}
              onToggle={() => {
                setPlanCollapsed(false)
                setPlanOpen((o) => !o)
              }}
            />
          )}
        </div>
      </header>

      {lostSave && (
        <div
          role="alert"
          data-testid="calendar-lost-save"
          className="flex shrink-0 items-center gap-2 rounded-item border border-confused-line bg-confused-soft py-1.5 pr-1.5 pl-3 text-body text-confused"
        >
          <span className="min-w-0 flex-1">{lostSave}</span>
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => setLostSave(null)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-item transition-colors hover:bg-surface-raised"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <RefitBanner
        refit={refit}
        layer={layer}
        onReveal={(startsAt) => {
          // Show the first new time: its week (or day).
          const start = Date.parse(startsAt)
          if (start < Date.parse(range.from) || start >= Date.parse(range.to)) setAnchorDay(startOfDay(new Date(start)))
        }}
      />
      {layer.source !== REFIT_SOURCE && (!planOpen || planCollapsed || layer.source !== 'autofill') && <ProposalTray layer={layer} />}

      <div ref={gridAreaRef} className="@container/cal relative flex min-h-0 flex-1 gap-3">
        <TimeGrid
          days={days}
          items={items}
          now={now}
          isDimmed={isDimmed}
          isLinked={isLinked}
          activeKey={popover?.mode === 'edit' ? popover.key : undefined}
          popoverOpen={!!popover}
          onCreate={handleCreate}
          onOpen={handleOpen}
          onMove={handleMove}
          proposals={layer.proposals}
          savedProposalIds={layer.savedIds}
          onProposalMove={(id, start, end) => layer.move(id, start.toISOString(), end.toISOString())}
          onProposalNudge={layer.nudge}
          onProposalAccept={(id) => void layer.accept(id)}
          onProposalDismiss={layer.dismiss}
          freeTime={freeTime}
          reveal={reveal}
          incoming={incoming}
          onDropIncoming={(start) => {
            const todo = incoming
            setIncoming(null)
            if (!todo) return
            scheduleTodo(todo, start, todo.durationMin).catch((e: unknown) =>
              setNotice(e instanceof ScheduleClash ? e.message : `Couldn't add "${todo.title}" to the calendar - try again?`),
            )
          }}
        />
        {planLayout && planCollapsed && (
          // Bottom corner, clear of the day headers.
          // Takes focus when Hide tucks the panel away (it only appears then).
          <button
            type="button"
            autoFocus
            onClick={() => setPlanCollapsed(false)}
            className={cn(
              'absolute bottom-3 z-30 inline-flex h-9 items-center gap-2 rounded-full bg-accent px-3.5 text-body font-medium text-accent-foreground shadow-pop transition-opacity hover:opacity-90',
              placement.side === 'left' ? 'left-3' : 'right-3',
            )}
          >
            <Sparkles className="h-4 w-4" />
            Show plan
          </button>
        )}
        {planLayout && !planCollapsed && (
          // Floats over the days already past or the weekend, so the days
          // being planned keep their full width; docks beside the grid
          // rather than hide a draft. "Hide" tucks it away.
          <div
            data-placement={placement.side}
            className={cn(
              'z-30 flex max-w-full rounded-widget shadow-pop',
              placement.side === 'docked' ? 'relative shrink-0' : 'absolute inset-y-0',
              placement.side === 'right' && 'right-0',
            )}
            style={{ width: placement.width, ...(placement.side === 'left' ? { left: placement.left } : {}) }}
          >
            <HelpMePlanPanel
              layout={planLayout}
              weekLabel={weekLabel}
              now={now.getTime()}
              layer={layer}
              todos={todos}
              autofill={autofill}
              onAutofillChange={setAutofill}
              onClose={() => {
                setPlanOpen(false)
                requestAnimationFrame(() => planButtonRef.current?.focus())
              }}
              onCollapse={() => setPlanCollapsed(true)}
              onSchedule={(todo, start, durationMin) => scheduleTodo(todo, start, durationMin)}
              onDragTodo={setIncoming}
              onStudyMinPerDayChange={(min) => {
                setStudyMinPerDay(min)
                onConfigChange?.({ studyMinPerDay: min })
              }}
            />
          </div>
        )}
      </div>

      {popover?.mode === 'create' && (
        <EventPopover
          key={`create-${popover.draft.start.toISOString()}`}
          x={popover.x}
          y={popover.y}
          bounds={bounds}
          initial={popover.draft}
          canEdit
          busy={busy}
          pending={popoverPending}
          error={error}
          onClose={closePopover}
          onSubmit={(draft) => run('add', `Couldn't add "${draft.title}".`, () => createItem.mutateAsync(newItemFromDraft(draft, localTimeZone())))}
        />
      )}
      {popover?.mode === 'edit' && editing && fromMoment(editing) && !popover.editingTime && (
        <StudyBlockPopover
          x={popover.x}
          y={popover.y}
          bounds={bounds}
          row={editing}
          moment={popover.moment}
          canShowMoment={!!onShowMoment}
          canEdit
          busy={busy}
          pending={popoverPending}
          error={error}
          onClose={closePopover}
          onGoToMoment={() => void showMoment(editing, editing.occurrence_key)}
          onToggleDone={() => run('done', doneFailed(editing), () =>
            editing.status === 'done'
              ? updateItem.mutateAsync({ id: editing.id, patch: { status: 'open' } })
              : completeItem.mutateAsync(editing.id),
          )}
          onEditTime={() => {
            setError(null)
            setPopover((p) => (p?.mode === 'edit' ? { ...p, editingTime: true } : p))
          }}
          onEditAutomation={onEditAutomation}
        />
      )}
      {popover?.mode === 'edit' && editing && (!fromMoment(editing) || popover.editingTime) && (
        <EventPopover
          // Keyed by the stored version too: if the item changes underneath
          // (an automation moves it), the form starts again from what is
          // stored instead of showing the old times.
          key={`edit-${editing.occurrence_key}-${editing.updated_at}`}
          x={popover.x}
          y={popover.y}
          bounds={bounds}
          row={editing}
          initial={draftFromRow(editing)}
          canEdit
          busy={busy}
          pending={popoverPending}
          error={error}
          onClose={closePopover}
          onSubmit={(draft) => {
            const patch = patchFromDraft(editing, draft, localTimeZone())
            if (Object.keys(patch).length === 0) return closePopover()
            void run('save', `Couldn't save "${editing.title}".`, () => updateItem.mutateAsync({ id: editing.id, patch }))
          }}
          onDelete={() => run('delete', `Couldn't delete "${editing.title}".`, () => deleteItem.mutateAsync(editing.id))}
          onToggleDone={
            editing.kind === 'commitment'
              ? undefined
              : () => run('done', doneFailed(editing), () =>
                  editing.status === 'done'
                    ? updateItem.mutateAsync({ id: editing.id, patch: { status: 'open' } })
                    : completeItem.mutateAsync(editing.id),
                )
          }
        />
      )}
    </div>
  )
}

const navButton = 'inline-flex items-center justify-center rounded-item border border-border bg-surface-raised text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50'

/** What a failed "Mark done" (or "Not done yet") says once its popover has closed. */
function doneFailed(row: PlanItemOccurrence): string {
  return row.status === 'done' ? `Couldn't reopen "${row.title}".` : `Couldn't mark "${row.title}" done.`
}
