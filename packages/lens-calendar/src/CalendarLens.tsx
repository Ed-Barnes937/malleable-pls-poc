import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_PREFERENCES, bookedMinutes, formatMinutes, isSession, sessionParentId, suggestTaskSlots, isClassBlock, newSession, todosToPlan, occurrenceDate, openTime, outsideStudyHours, weekLayout, type BoardScope, type PlanItemOccurrence, type PlanItemPatch, type PlanItemUndoState } from '@pls/substrate'
import { confirmWithUndo, useDraftUndo, type LensProps, type DateRange, useLinkedToLecture, useMissedBlocks, takeHelpMePlanRequest, useHelpMePlanRequest, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { Presence, SegmentedControl, cn, useCourse, useNarrowScreen } from '@pls/shared-ui'
import { ChevronLeft, ChevronRight, Plus, Sparkles, X } from 'lucide-react'
import { TimeGrid, type Anchor, type Reveal } from './TimeGrid'
import { EVENT_POPOVER_WIDTH, EventPopover, eventPopoverLabel } from './EventPopover'
import type { PendingAction } from './pending'
import { STUDY_BLOCK_POPOVER_WIDTH, StudyBlockPopover, type MomentState } from './StudyBlockPopover'
import { CalendarPopover, type Span } from './calendar-popover'
import { ClassLectureSection, type ClassLectureState } from './ClassLectureSection'
import { markClosingPress } from './closing-press'
import { FindAnotherTime, TickTodoToo } from './StudyBlockActions'
import { HelpMePlanButton, HelpMePlanPanel, ScheduleClash, type DraggedTodo } from './HelpMePlan'
import { ProposalTray } from './ProposalTray'
import { REFIT_SOURCE, RefitBanner, useRefitDraft } from './RefitBanner'
import { acceptPatch, useProposalLayer, type Proposal, type ProposalValidator } from './proposals'
import type { AutofillState } from './autofill'
import { draftFromRow, movePatch, newItemFromDraft, patchFromDraft, type Draft } from './drafts'
import { createSaveQueue } from './save-queue'
import { toneFor } from './colors'
import { addDays, formatDayName, formatFullDay, formatRangeTitle, formatSpan, localTimeZone, startOfDay, startOfWeek } from './time'
import { PLAN_PANEL_PX, coveredDays, planPanelPlacement, useWeekGeometry } from './plan-panel'

type View = 'week' | 'day'

type Popover =
  | { mode: 'create'; x: number; y: number; span?: Span; draft: Draft }
  /**
   * A block from a lecture moment opens on where it came from; `editingTime`
   * swaps that for the date and time pickers.
   */
  | {
      mode: 'edit'; x: number; y: number; span?: Span; key: string; moment?: MomentState; editingTime?: boolean; armDelete?: boolean
      /** A class block's lecture, focused on the board as the popover opens. */
      lecture?: ClassLectureState
      /** The last open session of this to-do was just ticked here: "Tick off <to-do> too?". */
      tickTodo?: { id: string; title: string }
    }

/** A drag the server hasn't confirmed yet, shown until fresher data arrives. */
interface PendingMove {
  starts_at: string
  ends_at: string
  /** The row's `updated_at` when dragged: newer data supersedes the override. */
  basis: string
  /** Its saves are still going (see `createSaveQueue`): shown here whatever the rows say meanwhile. */
  saving: boolean
}

/** How much the calendar's width must change while a popover is open to count as the phone turning (more than a scrollbar). */
const TURN_PX = 16
/** Air between the grid's prompts (re-fit, suggested blocks) and a Help me plan panel over the grid. */
const PROMPTS_GAP_PX = 8
/** Beside Show plan (at the grid's bottom corner) while the Help me plan panel is tucked away. */
const SHOW_PLAN_ROOM_PX = 12 + 128 + PROMPTS_GAP_PX

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

/** "Biology highlighted": the board course, in its colours. Nothing until the course is known. */
function HighlightChip({ courseId }: { courseId: string }) {
  const course = useCourse(courseId)
  if (!course) return null
  return (
    <span
      data-testid="calendar-highlight"
      className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-meta font-semibold', course.tone.soft, course.tone.ink)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', toneFor(course.tone).bar)} />
      {course.name} highlighted
    </span>
  )
}

export default function CalendarLens({
  panelId, highlight, config, onConfigChange, onShowMoment, onEditAutomation, focusedPlanItem, onPlanItemShown,
  onFocusClass, onUndoFocusClass, lectureBoards, boardShowsLectures, onOpenLectureOn, onAddWidget, asksAboutMissedBlocks, onNotify, onDismissNotice,
}: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()
  const createItem = mutations.useCreatePlanItem()
  const updateItem = mutations.useUpdatePlanItem()
  const completeItem = mutations.useCompletePlanItem()
  const deleteItem = mutations.useDeletePlanItem()
  const restoreItem = mutations.useRestorePlanItem()
  // The student's study rhythm (one per user, not per board): study hours and
  // study time per day bound everything Help me plan places.
  const preferences = substrate.usePreferences()
  const updatePreferences = mutations.useUpdatePreferences()

  const now = useNow()
  const narrow = useNarrowScreen()
  const savedView: View = config.view === 'day' ? 'day' : 'week'
  // A phone opens in Day view: seven columns don't fit.
  const [view, setViewState] = useState<View>(() => (narrow ? 'day' : savedView))
  const [anchorDay, setAnchorDay] = useState(() => startOfDay(new Date()))
  const [popover, setPopover] = useState<Popover | null>(null)
  /**
   * The popover UI SDK is closing, with its row: kept rendered (with
   * open=false) until its exit animation ends, so it can hand focus back.
   */
  const [closing, setClosing] = useState<{ popover: Popover; row?: PlanItemOccurrence } | null>(null)
  const popoverRef = useRef(popover)
  popoverRef.current = popover
  /** The popover open when the calendar last turned, until it is placed again beside its block. */
  const turnedRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Map<string, PendingMove>>(new Map())
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const [planOpen, setPlanOpen] = useState(false)
  /** In a narrow calendar the panel overlays the grid: the student can tuck it away to see the ghosts. */
  const [planCollapsed, setPlanCollapsed] = useState(false)
  /** Auto-fill's draft (note, trims, what didn't fit), kept here so closing the panel keeps it. */
  const [autofill, setAutofill] = useState<AutofillState>({ state: 'idle' })
  /** A to-do being dragged from Help me plan onto the grid. */
  const [incoming, setIncoming] = useState<DraggedTodo | null>(null)
  /** A calm note in the header, e.g. a move that didn't save. */
  const [notice, setNotice] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const planButtonRef = useRef<HTMLButtonElement>(null)
  /** What had focus when the popover opened: focus goes back there when it closes (`finalFocus`). */
  const openerRef = useRef<HTMLElement | null>(null)
  /** The row the open popover edits, for the popover while it closes (the row may be gone by then). */
  const editingRef = useRef<PlanItemOccurrence | undefined>(undefined)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  /**
   * Whether the last input was a touch press (not a mouse press or a key). A
   * popover opened by touch focuses its card, not its first field, so a phone's
   * on-screen keyboard doesn't open over the block just tapped. Decided by the
   * press's pointer type, not the screen width: a mouse on a narrow window
   * still gets the first field, a finger on a tablet doesn't.
   */
  const touchedRef = useRef(false)
  const [touchOpened, setTouchOpened] = useState(false)
  const openPopover = (next: Popover) => {
    setTouchOpened(touchedRef.current)
    const active = document.activeElement
    openerRef.current = active instanceof HTMLElement && rootRef.current?.contains(active) ? active : null
    setError(null)
    setNotice(null)
    setClosing(null)
    // A popover opened after the calendar turned is not the one to move.
    turnedRef.current = null
    setPopover(next)
  }
  /**
   * Closes the popover. UI SDK keeps it on screen while it animates out and
   * returns focus to what opened it if focus was inside it (`finalFocus`);
   * a press that closed it then puts focus where it pressed (another block,
   * a button), as before.
   */
  const closePopover = useCallback(() => {
    const open = popoverRef.current
    if (open) setClosing({ popover: open, row: open.mode === 'edit' ? editingRef.current : undefined })
    setPopover(null)
  }, [])
  const returnFocus = useCallback(() => {
    const opener = openerRef.current
    return opener?.isConnected ? opener : null
  }, [])
  /** Closes the popover for somewhere else that takes focus (another board, the board menu): focus isn't handed back. */
  const leavePopover = useCallback(() => {
    openerRef.current = null
    closePopover()
  }, [closePopover])
  /**
   * A press anywhere in the calendar but the popover closes it and still
   * does what it does, so a block can be dragged (or opened) straight away.
   * A press on empty time only closes it (`closedPopover` in TimeGrid), and
   * so does a plain click on the block it is open on (a toggle). While its
   * save is in flight a press only closes it and moves nothing: a move would
   * land first and the slower save would then put the block back.
   * Presses outside the calendar leave it open, e.g. while the student
   * edits the automation its footer opened.
   */
  const closeOnPressAway = (e: ReactPointerEvent) => {
    touchedRef.current = e.pointerType === 'touch'
    if (!popover || (e.target as Element).closest?.('[data-calendar-popover]')) return
    markClosingPress(e.nativeEvent, { key: popover.mode === 'edit' ? popover.key : null, closeOnly: !!popoverPending })
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

  // The top bar's "Plan my week": Help me plan opens here, in Week view on
  // this week (even on a phone, where Day view has no Help me plan).
  const planRequest = useHelpMePlanRequest()
  useEffect(() => {
    if (!takeHelpMePlanRequest(panelId)) return
    setViewState('week')
    setAnchorDay(startOfDay(new Date()))
    setPlanCollapsed(false)
    setPlanOpen(true)
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [planRequest, panelId])

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
      takeFocus: focusedPlanItem.takeFocus,
    })
    onPlanItemShown?.(focusedPlanItem.requestId)
  }, [focusedPlanItem, onPlanItemShown, view])

  // Never pass `highlight` here: the calendar shows every course's
  // commitments and only dims the ones outside the board's course.
  const { data, isLoading } = substrate.usePlanItems({ from: range.from, to: range.to, statuses: ['open', 'done'] })
  // The grid shows once the first week is in (see below); after that it stays.
  const weekLoaded = useRef(false)
  if (data) weekLoaded.current = true
  const weekShown = weekLoaded.current
  // Open to-dos with time still to book: what Help me plan offers, and what
  // an Auto-fill ghost's to-do must still be when it is accepted. A to-do
  // booked in part (its own block, or sessions) offers only the time not
  // booked yet (`todosToPlan`).
  const { data: taskData } = substrate.usePlanItems({ kinds: ['task'], statuses: ['open', 'done'] })
  const taskRows = taskData as PlanItemOccurrence[] | undefined
  const booked = useMemo(() => bookedMinutes(taskRows ?? []), [taskRows])
  const openTodos = useMemo(() => taskRows?.filter((t) => t.status === 'open' && !isSession(t)), [taskRows])
  const todoData = useMemo(() => (openTodos ? todosToPlan(openTodos, booked) : undefined), [openTodos, booked])

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
      return p && (p.saving || p.basis === r.updated_at) ? { ...r, starts_at: p.starts_at, ends_at: p.ends_at } : r
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
      return !p.saving && (!r || r.updated_at !== p.basis)
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

  /**
   * The block a study block at [start, end) would overlap (commitments and
   * other study time). `self` is the row being moved there, which doesn't
   * count; null when the block is a new session (the to-do's own block, if
   * it has one, counts like any other).
   */
  const clashAt = useCallback(
    (self: string | null, start: number, end: number) =>
      items.find((r) =>
        r.id !== self && r.status !== 'dismissed' && r.kind !== 'deadline' && r.starts_at && r.ends_at
        && Date.parse(r.starts_at) < end && start < Date.parse(r.ends_at)) ?? null,
    [items],
  )

  // Study blocks whose time passed without being done, offered for re-fitting.
  const missed = useMissedBlocks()
  // Undo for an accepted draft (Auto-fill, re-fit); its toast goes once a block it changed is edited.
  const draftUndo = useDraftUndo({ onNotify, onDismissNotice, rows: taskRows })
  const refit = useRefitDraft(missed, draftUndo)
  const missedIds = useMemo(() => (missed.preview ? new Set(missed.preview.map((m) => m.item.id)) : null), [missed.preview])

  const validateProposal: ProposalValidator = useCallback((p, source) => {
    if (source === 'autofill' && todos && !todos.some((t) => t.id === p.taskId)) return 'it already has a time'
    if (source === REFIT_SOURCE) {
      if (missedIds && !missedIds.has(p.taskId)) return 'it was already moved, done or removed'
      if (Date.parse(p.startsAt) < Date.now()) return 'that time has already started'
    }
    const clash = clashAt(p.session ? null : p.taskId, Date.parse(p.startsAt), Date.parse(p.endsAt))
    return clash ? `that time overlaps ${clash.title}` : null
  }, [todos, clashAt, missedIds])

  // Ghost blocks (Auto-fill drafts, re-fitted blocks): client state until
  // accepted. An Auto-fill ghost saves like a drag would; re-fitted ones are
  // written together by `planItems.refit`, which refuses a stale preview.
  // Each is checked against the calendar as it is now, so a ghost never
  // lands on something.
  /** Shrinks already saved with a split to-do's sessions (`taskId:minutes`). */
  const shrunkRef = useRef(new Set<string>())
  /**
   * Each to-do an Accept writes, as it was before that Accept (read from the
   * server before its first write in the Accept), and whether anything of
   * it was written, until the Accept is confirmed with Undo. One that was
   * only partly written (a Shrink saved, then its session failed) is still
   * undone with the rest.
   */
  const beforeAcceptRef = useRef(new Map<string, { title: string; state: PlanItemUndoState | null; wrote: boolean; shrunkTo?: number }>())
  const confirmAccepted = useCallback((accepted: Proposal[]) => {
    const touched = [...beforeAcceptRef.current.entries()].filter(([, e]) => e.wrote)
    beforeAcceptRef.current.clear()
    const before = touched.flatMap(([, e]) => e.state ?? [])
    if (before.length === 0) return
    const n = accepted.length
    const taskIds = touched.map(([id]) => id)
    // Nothing booked, but a Shrink saved: one error toast, whose Undo puts the estimate back.
    const shrunk = n === 0 ? touched.find(([, e]) => e.shrunkTo !== undefined)?.[1] : undefined
    void draftUndo.confirm({
      before,
      message: n === 0
        ? `Couldn't book "${touched[0][1].title}".${shrunk ? ` Its estimate changed to ${formatMinutes(shrunk.shrunkTo!)}` : ''}`
        : n === 1 ? `Added "${accepted[0].title}" to your plan` : `Added ${n} blocks to your plan`,
      tone: n === 0 ? 'error' : undefined,
      failMessage: n === 0 ? "Couldn't put its estimate back." : n === 1 ? "Couldn't take that block out of your plan." : "Couldn't take those blocks out of your plan.",
      // A Shrink undone is offered again on the next draft.
      onUndone: () => {
        for (const key of [...shrunkRef.current]) if (taskIds.some((id) => key.startsWith(`${id}:`))) shrunkRef.current.delete(key)
      },
    })
  }, [draftUndo])
  const layer = useProposalLayer({
    // A session is its own study block, linked to the to-do; anything else is the to-do's own time.
    save: async (p) => {
      let entry = beforeAcceptRef.current.get(p.taskId)
      if (!entry) {
        const [state] = (await draftUndo.readBefore([p.taskId])) ?? [null]
        // The to-do's own title: a session's ("... (1 of 3)") is not what an estimate belongs to.
        entry = { title: state?.title ?? p.title, state: state ?? null, wrote: false }
        beforeAcceptRef.current.set(p.taskId, entry)
      }
      const wrote = <T,>(result: T) => {
        entry.wrote = true
        return result
      }
      if (!p.session) return wrote(await updateItem.mutateAsync({ id: p.taskId, patch: acceptPatch(p) }))
      const todo = todos?.find((t) => t.id === p.taskId)
      if (!todo) throw new Error(`"${p.title}" is no longer waiting for a time`)
      // A Shrink is kept, as it is when a to-do is booked in one block: once per to-do and length.
      const estimate = p.session.estimateMin
      const stored = openTodos?.find((t) => t.id === p.taskId)
      const key = `${p.taskId}:${estimate}`
      if (estimate !== undefined && stored && stored.duration_min !== estimate && !shrunkRef.current.has(key)) {
        wrote(await updateItem.mutateAsync({ id: p.taskId, patch: { duration_min: estimate } }))
        entry.shrunkTo = estimate
        shrunkRef.current.add(key)
      }
      return wrote(await createItem.mutateAsync(newSession(todo, p.startsAt, p.endsAt)))
    },
    saveTogether: { [REFIT_SOURCE]: refit.save },
    onAccepted: confirmAccepted,
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

  // Help me plan works on the week shown, around every course's commitments,
  // inside the student's study hours (read in their zone if they set one).
  // It waits for the preference so a draft never uses the wrong hours; if it
  // can't load, the defaults apply, as on the server with no preference saved.
  const prefs = preferences.data ?? (preferences.error ? DEFAULT_PREFERENCES : undefined)
  const browserZone = useMemo(() => localTimeZone(), [])
  const planLayout = useMemo(
    () => (planOpen && view === 'week' && prefs
      ? weekLayout(items, { start: Date.parse(range.from), end: Date.parse(range.to) }, {
          timeZone: prefs.time_zone ?? browserZone,
          studyHours: prefs.study_hours,
          studyMinPerDay: prefs.study_min_per_day,
        })
      : null),
    [planOpen, view, items, range, browserZone, prefs],
  )
  // Whenever there is a plan layout, the preference it was made from.
  const planPrefs = prefs ?? DEFAULT_PREFERENCES
  // Hours outside study time get a wash on the grid while planning.
  const offStudyHours = useMemo(
    () => (planLayout ? outsideStudyHours(planLayout.week, planLayout.timeZone, planPrefs.study_hours) : undefined),
    [planLayout, planPrefs.study_hours],
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
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null)
  const geometry = useWeekGeometry(gridAreaRef, gridEl, !!planLayout, range.from)
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
  /**
   * Hand bookings still saving. Auto-fill sends them with its request, so the
   * server's advice counts them as booked and never ranks, trims or names a
   * to-do the student has just given a time (the draft itself already drafts
   * around them, see `assigning`).
   */
  const savingRef = useRef(new Map<Promise<unknown>, { id: string; starts_at: string; ends_at: string }>())
  const tracked = <T,>(save: Promise<T>, booking: { id: string; starts_at: string; ends_at: string }): Promise<T> => {
    savingRef.current.set(save, booking)
    save.then(() => savingRef.current.delete(save), () => savingRef.current.delete(save))
    return save
  }
  const pendingBookings = useCallback(() => [...savingRef.current.values()], [])

  const scheduleTodo = async (todo: { id: string; title: string }, start: Date, durationMin: number) => {
    const end = start.getTime() + durationMin * 60_000
    const clash = clashAt(booked.has(todo.id) ? null : todo.id, start.getTime(), end)
    if (clash) throw new ScheduleClash(`"${todo.title}" would overlap ${clash.title} there. Pick a free time.`)
    const patch = { starts_at: start.toISOString(), ends_at: new Date(end).toISOString(), duration_min: durationMin }
    const row = todos?.find((t) => t.id === todo.id)
    // A to-do already booked in sessions gets another session: its own row keeps its total.
    if (row && booked.has(todo.id)) {
      await tracked(createItem.mutateAsync(newSession(row, patch.starts_at, patch.ends_at)), { id: todo.id, starts_at: patch.starts_at, ends_at: patch.ends_at })
      return
    }
    if (row) setAssigning((prev) => new Map(prev).set(todo.id, { ...row, ...patch, occurrence_key: todo.id }))
    try {
      await tracked(updateItem.mutateAsync({ id: todo.id, patch }), { id: todo.id, starts_at: patch.starts_at, ends_at: patch.ends_at })
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
  // Rings the board's lecture: its class occurrence and blocks made from its moments.
  const isLinked = useLinkedToLecture(highlight?.lectureId)

  const relative = (anchor: Anchor) => {
    const left = rootRef.current?.getBoundingClientRect().left ?? 0
    const top = rootRef.current?.getBoundingClientRect().top ?? 0
    const span = anchor.span && { top: anchor.span.top - top, bottom: anchor.span.bottom - top }
    return { x: anchor.clientX - left, y: anchor.clientY - top, span }
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

  /** Tells one class open (or Try again) from the next: only the latest answer is shown. */
  const focusRequestRef = useRef(0)
  /**
   * The class opens Undo answers for: the board as it was before the first
   * of them, and as the latest left it. A run of opens is one session when
   * each is made straight from the last one's popover (a press on the next
   * block) or before the last one has answered, so Undo after quick opens
   * puts back the board the student started from, not a class they passed
   * through. Anything else that closes the popover ends it.
   */
  const focusSessionRef = useRef<{ before?: BoardScope; after?: BoardScope; unanswered: number }>({ unanswered: 0 })
  /**
   * The student's zone once their preferences have loaded: an occurrence's
   * date is read in the zone the server will read it in (their stored zone,
   * else this browser's).
   */
  const prefsRef = useRef(prefs)
  const prefsWaiting = useRef<Array<() => void>>([])
  useEffect(() => {
    prefsRef.current = prefs
    if (prefs) for (const resume of prefsWaiting.current.splice(0)) resume()
  }, [prefs])
  const studentZone = async () => {
    if (!prefsRef.current) await new Promise<void>((resume) => prefsWaiting.current.push(resume))
    return prefsRef.current?.time_zone ?? browserZone
  }
  /**
   * Opening a class block focuses its occurrence's lecture, with its course,
   * on this board (the shell finds or makes it). Only an open does: a drag
   * or resize never calls this. `continued`: made from a popover still open
   * (Try again, or straight from another block's), so Undo keeps the
   * session's board from before.
   */
  const focusClass = async (item: PlanItemOccurrence, key: string, continued: boolean) => {
    if (!onFocusClass || !isClassBlock(item)) return
    const request = ++focusRequestRef.current
    if (!continued && focusSessionRef.current.unanswered === 0) focusSessionRef.current = { unanswered: 0 }
    const session = focusSessionRef.current
    const setLecture = (lecture: ClassLectureState) =>
      setPopover((p) => (p?.mode === 'edit' && p.key === key && (p.lecture?.request ?? 0) <= request ? { ...p, lecture } : p))
    setLecture({ state: 'pending', request })
    session.unanswered++
    let result: Awaited<ReturnType<typeof onFocusClass>> = { status: 'failed' }
    try {
      const date = occurrenceDate(item, await studentZone())
      if (date) result = await onFocusClass({ planItemId: item.id, date })
    } finally {
      session.unanswered--
    }
    if (result.status !== 'focused') return setLecture({ state: 'failed', request })
    // A board changed between two opens (elsewhere) starts the session over:
    // Undo never puts back past a change it didn't make.
    if (!session.before || !session.after || !sameScope(session.after, result.board.before)) session.before = result.board.before
    session.after = result.board.after
    const board = { before: session.before, after: result.board.after }
    const changed = !sameScope(board.before, board.after)
    setLecture({
      state: 'focused',
      request,
      lecture: result.lecture,
      undo: changed && onUndoFocusClass ? () => onUndoFocusClass(board) : undefined,
      after: board.after,
    })
  }

  const currentCourse = highlight && (highlight.courseTag ?? null)
  const currentLecture = highlight && (highlight.lectureId ?? null)
  const currentBoard = useMemo<BoardScope | undefined>(
    () => (currentCourse === undefined || currentLecture === undefined ? undefined : { courseTag: currentCourse, lectureId: currentLecture }),
    [currentCourse, currentLecture],
  )

  const handleOpen = (item: PlanItemOccurrence, anchor: Anchor) => {
    openPopover({ mode: 'edit', ...relative(anchor), key: item.occurrence_key })
    void focusClass(item, item.occurrence_key, !!anchor.fromPopover)
  }

  const handleCreate = (start: Date, end: Date, anchor: Anchor) => {
    openPopover({
      mode: 'create',
      ...relative(anchor),
      draft: { kind: 'commitment', title: '', start, end, course: highlight?.courseTag ?? null, repeatsWeekly: false },
    })
  }

  const handleAskDelete = (item: PlanItemOccurrence, anchor: Anchor) => {
    // A block from a moment asks in its edit view, where its Delete is.
    openPopover({ mode: 'edit', ...relative(anchor), key: item.occurrence_key, armDelete: true, editingTime: fromMoment(item) || undefined })
  }

  /**
   * Moves save one at a time per block, latest wins (quick arrow presses):
   * the block shows where it was put until its last save lands.
   */
  const dataRef = useRef(data)
  dataRef.current = data
  const updateRef = useRef(updateItem)
  updateRef.current = updateItem
  const [moveQueue] = useState(() => createSaveQueue<{ id: string; title: string; patch: PlanItemPatch; start: Date; end: Date }>(
    (_key, save) => updateRef.current.mutateAsync({ id: save.id, patch: save.patch }),
    {
      onDone: (key, { value, error, landed }) => {
        // Never snap back silently: say the move didn't stick, and where the block is.
        if (error) {
          setNotice(landed
            ? `Couldn't move "${value.title}" there - it's at ${formatDayName(landed.start)} ${formatSpan(landed.start, landed.end)}, where it last saved. Try again?`
            : `Couldn't move "${value.title}" - it's back where it was. Try again?`)
        }
        // Saved: shown as put until rows newer than these arrive. Failed after
        // an earlier save landed: shown there (where it is) on the same terms.
        // Failed with nothing saved: the rows say where it is.
        const row = (dataRef.current as PlanItemOccurrence[] | undefined)?.find((r) => r.occurrence_key === key)
        setPending((prev) => {
          const p = prev.get(key)
          if (!p) return prev
          const next = new Map(prev)
          const basis = row?.updated_at ?? p.basis
          if (!error) next.set(key, { ...p, saving: false, basis })
          else if (landed) next.set(key, { starts_at: landed.start.toISOString(), ends_at: landed.end.toISOString(), saving: false, basis })
          else next.delete(key)
          return next
        })
      },
    },
  ))
  const handleMove = (item: PlanItemOccurrence, start: Date, end: Date) => {
    const key = item.occurrence_key
    // Patched from the row as stored, not as shown while earlier moves save.
    const stored = (data as PlanItemOccurrence[] | undefined)?.find((r) => r.occurrence_key === key) ?? item
    // While an earlier move is saving, or saved but its rows not yet here,
    // the rows may not say where the server is: send every field.
    const unsure = moveQueue.busy(key) || pendingRef.current.has(key)
    const patch = movePatch(stored, start, end, { all: unsure })
    if (Object.keys(patch).length === 0) return
    setPending((prev) => new Map(prev).set(key, {
      starts_at: start.toISOString(), ends_at: end.toISOString(), basis: stored.updated_at, saving: true,
    }))
    setNotice(null)
    moveQueue.push(key, { id: item.id, title: item.title, patch, start, end })
  }

  /** Which popover is open, so a save that lands after it closed doesn't touch the next one. */
  const popoverId = popover ? popoverIdOf(popover) : null
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
      // An action with something more to ask (Tick off the to-do too?) keeps its popover open.
      const result = await action()
      if (result !== KEEP_OPEN && popoverIdRef.current === started) closePopover()
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
  editingRef.current = editing

  /**
   * Mark done / Not done yet from a block's popover. Ticking a session ticks
   * only that session (flow-audit decision 10); when it was the to-do's last
   * open one, the popover stays to offer "Tick off <to-do> too?".
   */
  const toggleDone = (row: PlanItemOccurrence) => run('done', doneFailed(row), async () => {
    if (row.status === 'done') return updateItem.mutateAsync({ id: row.id, patch: { status: 'open' } })
    const parent = sessionParentId(row)
    const todo = parent ? openTodos?.find((t) => t.id === parent) : undefined
    const last = !!todo && !taskRows?.some((r) => r.id !== row.id && r.status === 'open' && sessionParentId(r) === parent)
    await completeItem.mutateAsync(row.id)
    if (!todo || !last) return
    setPopover((p) => (p?.mode === 'edit' && p.key === row.occurrence_key ? { ...p, tickTodo: { id: todo.id, title: todo.title } } : p))
    return KEEP_OPEN
  })

  /**
   * "Find another time": up to 3 other slots for `row` in the week (or day) shown, from the
   * planner (inside study hours and the daily budget, ending by its due
   * time), none overlapping where it is now.
   */
  const anotherTimes = (row: PlanItemOccurrence): number[] => {
    const p = prefs ?? DEFAULT_PREFERENCES
    const week = { start: Date.parse(range.from), end: Date.parse(range.to) }
    const layout = weekLayout(items, week, {
      timeZone: p.time_zone ?? browserZone, studyHours: p.study_hours, studyMinPerDay: p.study_min_per_day, except: new Set([row.id]),
    })
    const start = Date.parse(row.starts_at!)
    const end = Date.parse(row.ends_at!)
    const at = Date.now()
    const due = row.due_at ? Date.parse(row.due_at) : null
    const latest = due != null && due > Math.max(at, week.start) && due < week.end ? due : week.end
    return suggestTaskSlots({ id: row.id, durationMin: Math.round((end - start) / 60_000), latest }, layout, { now: at, n: 4 })
      .filter((slot) => !(slot.start < end && start < slot.end))
      .slice(0, 3)
      .map((slot) => slot.start)
  }

  /**
   * A study block's extras in its time-editing popover: Find another time
   * (next to the Day / From / To fields; a block from a moment reaches it
   * through Edit time), or the offer to tick its to-do off.
   */
  const blockActions = (row: PlanItemOccurrence) => {
    // The popover on screen, so one closing keeps what it showed.
    if (shown?.mode === 'edit' && shown.tickTodo) {
      const todo = shown.tickTodo
      return (
        <TickTodoToo
          title={todo.title}
          busy={busy}
          saving={popoverPending === 'done'}
          onTick={() => void run('done', `Couldn't mark "${todo.title}" done.`, () => completeItem.mutateAsync(todo.id))}
          onNotYet={closePopover}
        />
      )
    }
    if (row.kind !== 'task' || row.status !== 'open' || row.recurrence || !row.starts_at || !row.ends_at) return null
    const length = Date.parse(row.ends_at) - Date.parse(row.starts_at)
    return (
      <FindAnotherTime
        title={row.title}
        // Slots come from the days on screen, whose rows are loaded.
        within={view === 'week' ? 'this week' : 'that day'}
        due={!row.due_at ? 'none' : Date.parse(row.due_at) > Date.now() ? 'ahead' : 'past'}
        now={now.getTime()}
        busy={busy}
        saving={popoverPending === 'save'}
        slots={() => anotherTimes(row)}
        onPick={(start) => {
          const patch = movePatch(row, new Date(start), new Date(start + length))
          void run('save', `Couldn't move "${row.title}".`, () => updateItem.mutateAsync({ id: row.id, patch }))
        }}
      />
    )
  }
  // A deleted or moved-away row closes its popover.
  useEffect(() => {
    if (popover?.mode === 'edit' && data && !editing) closePopover()
  }, [popover, data, editing, closePopover])
  /** The popover on screen: the open one, or the one closing. */
  const shown = popover ?? closing?.popover ?? null
  const shownRow = popover ? editing : closing?.row

  // The calendar much wider or narrower while a popover is open (a phone
  // turned on its side) lays the blocks out afresh: a block's popover is
  // placed again beside its block once the block is drawn at the new width
  // (after a refetch, if the view changed), so it never covers it, and a new
  // block's from the same point across the calendar. Only the popover open
  // when the calendar turned is moved: one opened since is left alone. A
  // frame's small change (a scrollbar) is not a turn, and never moves it.
  const [turns, setTurns] = useState(0)
  const popoverOpen = popover !== null
  const popoverIdNow = useRef(popoverId)
  popoverIdNow.current = popoverId
  useEffect(() => {
    const root = rootRef.current
    if (!popoverOpen || !root || typeof ResizeObserver === 'undefined') return
    let placedWidth = root.clientWidth
    const observer = new ResizeObserver(() => {
      const width = root.clientWidth
      if (Math.abs(width - placedWidth) <= TURN_PX) return
      const was = placedWidth
      placedWidth = width
      const turned = popoverIdNow.current
      setPopover((cur) => {
        if (cur?.mode !== 'create' || popoverIdOf(cur) !== turned) return cur
        return { ...cur, x: (cur.x * width) / was }
      })
      turnedRef.current = turned
      setTurns((n) => n + 1)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [popoverOpen])
  useLayoutEffect(() => {
    const turned = turnedRef.current
    const root = rootRef.current
    if (turned === null || !root) return
    if (popover?.mode !== 'edit' || popoverId !== turned) {
      turnedRef.current = null
      return
    }
    // Not drawn yet (the new view still loading): placed once it is. If the
    // data says it is gone, the rule above closes the popover.
    const block = root.querySelector(`[data-occurrence-key="${CSS.escape(popover.key)}"]`)
    if (!block) return
    turnedRef.current = null
    const at = root.getBoundingClientRect()
    const box = block.getBoundingClientRect()
    const span = { top: box.top - at.top, bottom: box.bottom - at.top, left: box.left - at.left, right: box.right - at.left }
    setPopover((cur) => {
      if (cur?.mode !== 'edit' || popoverIdOf(cur) !== turned) return cur
      const into = cur.span ? Math.min(Math.max(cur.y - cur.span.top, 0), span.bottom - span.top) : (span.bottom - span.top) / 2
      return { ...cur, x: box.left + box.width / 2 - at.left, y: span.top + into, span }
    })
  }, [turns, popover, popoverId, items])

  const step = view === 'week' ? 7 : 1
  const phoneDay = narrow && view === 'day'
  const today = startOfDay(now)
  const showingToday = days.some((d) => d.getTime() === today.getTime())
  const busy = createItem.isPending || updateItem.isPending || completeItem.isPending || deleteItem.isPending
  // The prompts' place at the grid's foot: clear of the open Help me plan
  // panel, and above Show plan while the panel is tucked away.
  const promptsInset: CSSProperties = {}
  if (planLayout && planCollapsed) promptsInset[placement.side === 'left' ? 'paddingLeft' : 'paddingRight'] = SHOW_PLAN_ROOM_PX
  if (planLayout && !planCollapsed) {
    // Docked, the panel sits beside the grid and covers none of it.
    if (placement.side === 'left') promptsInset.paddingLeft = placement.left + placement.width + PROMPTS_GAP_PX
    else if (placement.side === 'right') promptsInset.paddingRight = placement.width + PROMPTS_GAP_PX
  }

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

  // The calendar's prompts (a lost save, the re-fit banner, the suggested
  // blocks tray) sit at the grid's foot, inside it: the grid fits its hours
  // to the room it has with them or without them (see TimeGrid's footer), so
  // it never moves or re-sizes its hours as they come and go (a drag at that
  // moment would land on the wrong hour; decision 13), and they never lie over
  // a block. Clear of the Help me plan panel and its Show plan button.
  const prompts = (
    <div
      data-testid="calendar-prompts"
      className="flex flex-col gap-1.5 border-t border-border-subtle p-2 empty:hidden"
      style={promptsInset}
    >
      <Presence>
      {lostSave && (
        <div
          role="alert"
          data-testid="calendar-lost-save"
          className="flex shrink-0 items-center gap-2 rounded-item border border-confused-line bg-confused-soft py-1.5 pr-1.5 pl-3 text-body text-confused motion-safe:animate-enter"
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
      </Presence>

      {/* A board asks once: in its first Calendar (decision 4). */}
      {asksAboutMissedBlocks !== false && (
        <RefitBanner
          refit={refit}
          layer={layer}
          onReveal={(startsAt) => {
            // Show the first new time: its week (or day).
            const start = Date.parse(startsAt)
            if (start < Date.parse(range.from) || start >= Date.parse(range.to)) setAnchorDay(startOfDay(new Date(start)))
          }}
        />
      )}
      {layer.source !== REFIT_SOURCE && (!planOpen || planCollapsed || layer.source !== 'autofill') && <ProposalTray layer={layer} />}
    </div>
  )

  return (
    <div ref={rootRef} data-testid="calendar" className="relative flex h-full min-h-0 flex-col gap-3" onPointerDownCapture={closeOnPressAway} onKeyDownCapture={() => { touchedRef.current = false }}>
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

        {highlight?.courseTag && <HighlightChip courseId={highlight.courseTag} />}

        {notice && (
          <span role="status" data-testid="calendar-notice" className="text-meta text-text-secondary">{notice}</span>
        )}
        {!notice && !isLoading && items.length === 0 && (
          <span className="text-meta text-text-muted">Nothing planned. Click or drag on the grid to add something.</span>
        )}

        <div className={cn('flex flex-wrap items-center gap-2', phoneDay ? 'w-full justify-between' : 'ml-auto')}>
          <SegmentedControl
            label="Calendar view"
            options={VIEW_OPTIONS}
            value={view}
            onValueChange={(v) => setView(v as View)}
            itemClassName="h-[30px]"
          />
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


      <div ref={gridAreaRef} className="@container/cal relative flex min-h-0 flex-1 gap-3">
        {weekShown ? (
          <TimeGrid
            rootRef={setGridEl}
            days={days}
            items={items}
            loading={!data}
            footer={prompts}
            now={now}
            isDimmed={isDimmed}
            isLinked={isLinked}
            activeKey={popover?.mode === 'edit' ? popover.key : undefined}
            popoverOpen={!!popover}
            onCreate={handleCreate}
            onOpen={handleOpen}
            onMove={handleMove}
            onAskDelete={handleAskDelete}
            proposals={layer.proposals}
            savedProposalIds={layer.lockedIds}
            onProposalMove={(id, start, end) => layer.move(id, start.toISOString(), end.toISOString())}
            onProposalNudge={(id, minutes, days) => {
              const put = layer.nudge(id, minutes, days)
              return put && { start: new Date(put.startsAt), end: new Date(put.endsAt) }
            }}
            onProposalAccept={(id) => void layer.accept(id)}
            onProposalDismiss={layer.dismiss}
            freeTime={freeTime}
            outsideStudyHours={offStudyHours}
            reveal={reveal}
            coveredDays={planLayout && !planCollapsed && geometry ? coveredDays(geometry, placement) : undefined}
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
        ) : (
          // Until the week first loads: the grid comes with its blocks (and its
          // row of due to-dos) rather than resizing under them as they land.
          <div aria-busy className="min-h-0 flex-1" />
        )}
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
              booked={booked}
              autofill={autofill}
              onAutofillChange={setAutofill}
              onClose={() => {
                setPlanOpen(false)
                requestAnimationFrame(() => planButtonRef.current?.focus())
              }}
              onCollapse={() => setPlanCollapsed(true)}
              onSchedule={(todo, start, durationMin) => scheduleTodo(todo, start, durationMin)}
              pendingBookings={pendingBookings}
              onDragTodo={setIncoming}
              studyHours={planPrefs.study_hours}
              onStudyRhythmChange={(change) => {
                // Saved for every board and the server's automatic placement,
                // and shown (and re-drafted) straight away. The first time
                // study hours are saved, the zone they are read in is too:
                // only when the saved preference has loaded and has none (never
                // from the defaults used when it failed to load).
                const loaded = preferences.data
                const zone = change.study_hours && loaded && loaded.time_zone === null ? { time_zone: browserZone } : {}
                updatePreferences.mutateAsync({ ...change, ...zone })
                  .catch(() => setNotice(change.study_hours
                    ? "Couldn't save your study hours. Try again?"
                    : "Couldn't save your study time per day. Try again?"))
              }}
            />
          </div>
        )}
      </div>

      {shown && (shown.mode === 'create' || shownRow) && (
        <CalendarPopover
          // One UI SDK Popover per popover opened: pressing block B while A's
          // is open drops A's at once rather than reopening it as B's, so A's
          // focus return (to what opened it, now B) can't follow B's first field.
          key={popoverIdOf(shown)}
          open={!!popover}
          root={rootRef}
          press={shown}
          width={shown.mode === 'edit' && shownRow && fromMoment(shownRow) && !shown.editingTime ? STUDY_BLOCK_POPOVER_WIDTH : EVENT_POPOVER_WIDTH}
          label={shown.mode === 'create' ? eventPopoverLabel() : shownRow && fromMoment(shownRow) && !shown.editingTime ? shownRow.title : eventPopoverLabel(shownRow)}
          variant={shown.mode === 'edit' && shownRow && fromMoment(shownRow) && !shown.editingTime ? 'study-block' : undefined}
          touch={touchOpened}
          finalFocus={returnFocus}
          onClose={closePopover}
          onClosed={() => setClosing(null)}
        >
          {shown.mode === 'create' && (
            <EventPopover
              focusFirst={!touchOpened}
              key={`create-${shown.draft.start.toISOString()}`}
              initial={shown.draft}
              canEdit
              busy={busy}
              pending={popoverPending}
              error={error}
              onClose={closePopover}
              onSubmit={(draft) => run('add', `Couldn't add "${draft.title}".`, () => createItem.mutateAsync(newItemFromDraft(draft, localTimeZone())))}
            />
          )}
          {shown.mode === 'edit' && shownRow && fromMoment(shownRow) && !shown.editingTime && (
            <StudyBlockPopover
              focusFirst={!touchOpened}
              row={shownRow}
              moment={shown.moment}
              canShowMoment={!!onShowMoment}
              canEdit
              busy={busy}
              pending={popoverPending}
              error={error}
              onClose={closePopover}
              onGoToMoment={() => void showMoment(shownRow, shownRow.occurrence_key)}
              onToggleDone={() => void toggleDone(shownRow)}
              onEditTime={() => {
                setError(null)
                setPopover((p) => (p?.mode === 'edit' ? { ...p, editingTime: true } : p))
              }}
              onEditAutomation={onEditAutomation}
            />
          )}
          {shown.mode === 'edit' && shownRow && (!fromMoment(shownRow) || shown.editingTime) && (
            <EventPopover
              focusFirst={!touchOpened}
              // Keyed by the stored version too: if the item changes underneath
              // (an automation moves it), the form starts again from what is
              // stored instead of showing the old times.
              key={`edit-${shownRow.occurrence_key}-${shownRow.updated_at}`}
              row={shownRow}
              initial={draftFromRow(shownRow)}
              canEdit
              busy={busy}
              pending={popoverPending}
              error={error}
              onClose={closePopover}
              onSubmit={(draft) => {
                const patch = patchFromDraft(shownRow, draft, localTimeZone())
                if (Object.keys(patch).length === 0) return closePopover()
                void run('save', `Couldn't save "${shownRow.title}".`, () => updateItem.mutateAsync({ id: shownRow.id, patch }))
              }}
              onDelete={() => run('delete', `Couldn't delete "${shownRow.title}".`, async () => {
                await deleteItem.mutateAsync(shownRow.id)
                // Undo puts it back as it was: a weekly one as the whole series, a to-do with its sessions.
                const { id, title } = shownRow
                confirmWithUndo(onNotify, {
                  key: 'plan-item-deleted',
                  message: `Deleted "${title}"`,
                  failMessage: `Couldn't bring back "${title}".`,
                  undo: () => restoreItem.mutateAsync(id),
                })
              })}
              armDelete={shown.armDelete}
              // As children, so it isn't remounted when the board's scope changes under it.
              children={shown.lecture ? (
                <ClassLectureSection
                  lecture={shown.lecture}
                  occurrence={shownRow}
                  now={now}
                  lectureBoards={lectureBoards}
                  boardShowsLectures={boardShowsLectures ?? false}
                  board={currentBoard}
                  narrow={narrow}
                  onRetry={() => void focusClass(shownRow, shownRow.occurrence_key, true)}
                  onOpenOn={onOpenLectureOn && (async (boardId, lecture) => {
                    const result = await onOpenLectureOn(boardId, lecture)
                    if (result === 'opened') leavePopover()
                    return result
                  })}
                  onAddWidget={onAddWidget && (() => {
                    leavePopover()
                    onAddWidget()
                  })}
                />
              ) : blockActions(shownRow)}
              onToggleDone={shownRow.kind === 'commitment' ? undefined : () => void toggleDone(shownRow)}
            />
          )}
        </CalendarPopover>
      )}
    </div>
  )
}

/** Which popover this is: what it creates (by start) or the occurrence it edits. */
function popoverIdOf(p: Popover) {
  return p.mode === 'create' ? `create-${p.draft.start.toISOString()}` : `edit-${p.key}`
}

const VIEW_OPTIONS = [{ value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }]

const navButton = 'inline-flex items-center justify-center rounded-item border border-border bg-surface-raised text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50'

/** Returned by a popover action that has more to ask, so `run` keeps the popover open. */
const KEEP_OPEN = Symbol('keep the popover open')

/** What a failed "Mark done" (or "Not done yet") says once its popover has closed. */
function doneFailed(row: PlanItemOccurrence): string {
  return row.status === 'done' ? `Couldn't reopen "${row.title}".` : `Couldn't mark "${row.title}" done.`
}

/** Whether two board scopes are the same course and lecture. */
function sameScope(a: BoardScope, b: BoardScope): boolean {
  return a.courseTag === b.courseTag && a.lectureId === b.lectureId
}
