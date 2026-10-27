import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { DEFAULT_STUDY_MIN_PER_DAY, openTime, weekLayout, type PlanItemOccurrence } from '@pls/substrate'
import { type LensProps, type DateRange, type ShowMomentResult, useMissedBlocks, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, cn, courseTone, formatTime } from '@pls/shared-ui'
import { ArrowUpRight, AudioLines, ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react'
import { TimeGrid, type Anchor } from './TimeGrid'
import { EventPopover } from './EventPopover'
import { HelpMePlanButton, HelpMePlanPanel, ScheduleClash, type DraggedTodo } from './HelpMePlan'
import { ProposalTray } from './ProposalTray'
import { REFIT_SOURCE, RefitBanner, useRefitDraft } from './RefitBanner'
import { acceptPatch, useProposalLayer, type ProposalValidator } from './proposals'
import type { AutofillState } from './autofill'
import { draftFromRow, movePatch, newItemFromDraft, patchFromDraft, type Draft } from './drafts'
import { toneFor } from './colors'
import { addDays, formatRangeTitle, localTimeZone, startOfDay, startOfWeek } from './time'

type View = 'week' | 'day'

type Popover =
  | { mode: 'create'; x: number; y: number; draft: Draft }
  | { mode: 'edit'; x: number; y: number; key: string; moment?: MomentState }

/** Where a block's lecture moment went after clicking it. */
type MomentState = 'opening' | ShowMomentResult | 'nowhere' | 'failed'

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

function courseLabel(course: string): string {
  return COURSES.find((c) => c.value === course)?.label ?? course
}

export default function CalendarLens({ highlight, config, onConfigChange, onShowMoment }: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()
  const createItem = mutations.useCreatePlanItem()
  const updateItem = mutations.useUpdatePlanItem()
  const completeItem = mutations.useCompletePlanItem()
  const deleteItem = mutations.useDeletePlanItem()

  const now = useNow()
  const [view, setViewState] = useState<View>(config.view === 'day' ? 'day' : 'week')
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
    if (opener?.isConnected) requestAnimationFrame(() => opener.focus())
  }, [])

  const setView = (next: View) => {
    setViewState(next)
    if (next !== 'week') setPlanOpen(false)
    onConfigChange?.({ view: next })
  }

  const days = useMemo(() => {
    if (view === 'day') return [anchorDay]
    const monday = startOfWeek(anchorDay)
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  }, [view, anchorDay])
  const range: DateRange = useMemo(
    () => ({ from: days[0].toISOString(), to: addDays(days[days.length - 1], 1).toISOString() }),
    [days],
  )

  // Never pass `highlight` here: the calendar shows every course's
  // commitments and only dims the ones outside the board's course.
  const { data, isLoading } = substrate.usePlanItems({ from: range.from, to: range.to, statuses: ['open', 'done'] })

  const items = useMemo(() => {
    const rows = (data ?? []) as PlanItemOccurrence[]
    if (pending.size === 0) return rows
    return rows.map((r) => {
      const p = pending.get(r.occurrence_key)
      return p && p.basis === r.updated_at ? { ...r, starts_at: p.starts_at, ends_at: p.ends_at } : r
    })
  }, [data, pending])

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

  // Open to-dos with no time yet: what Help me plan offers, and what an
  // Auto-fill ghost's to-do must still be when it is accepted.
  const { data: todoData } = substrate.usePlanItems({ kinds: ['task'], statuses: ['open'], scheduled: false })
  const todos = useMemo(() => (todoData ? (todoData as PlanItemOccurrence[]) : null), [todoData])

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
    await updateItem.mutateAsync({
      id: todo.id,
      patch: { starts_at: start.toISOString(), ends_at: new Date(end).toISOString(), duration_min: durationMin },
    })
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

  const showMoment = async (item: PlanItemOccurrence, key: string, elsewhere = false) => {
    if (!onShowMoment || item.source_id == null) return
    setPopover((p) => (p?.mode === 'edit' && p.key === key ? { ...p, moment: 'opening' } : p))
    let moment: MomentState
    try {
      const result = await onShowMoment(
        { recordingId: item.source_id, offsetMs: item.source_offset_ms ?? 0 },
        elsewhere ? { elsewhere: true } : undefined,
      )
      moment = elsewhere && result === 'no-viewer' ? 'nowhere' : result
    } catch {
      moment = 'failed'
    }
    setPopover((p) => (p?.mode === 'edit' && p.key === key ? { ...p, moment } : p))
  }

  const handleOpen = (item: PlanItemOccurrence, anchor: Anchor) => {
    openPopover({ mode: 'edit', ...relative(anchor), key: item.occurrence_key })
    // Clicking a block that came from a lecture moment lands on that moment.
    if (item.source_type === 'recording' && item.source_id) void showMoment(item, item.occurrence_key)
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

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      closePopover()
    } catch (e) {
      setError(e instanceof Error && e.message ? `Couldn't save: ${e.message}` : "Couldn't save - try again")
    }
  }

  const editing = popover?.mode === 'edit' ? items.find((r) => r.occurrence_key === popover.key) : undefined
  // A deleted or moved-away row closes its popover.
  useEffect(() => {
    if (popover?.mode === 'edit' && data && !editing) setPopover(null)
  }, [popover, data, editing])

  const step = view === 'week' ? 7 : 1
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

  return (
    <div ref={rootRef} data-testid="calendar" className="relative flex h-full min-h-0 flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={view === 'week' ? 'Previous week' : 'Previous day'}
            title={view === 'week' ? 'Previous week' : 'Previous day'}
            onClick={() => setAnchorDay((d) => addDays(d, -step))}
            className="inline-flex h-8 items-center justify-center rounded-item border border-border bg-surface-raised text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDay(today)}
            disabled={showingToday && view === 'day'}
            className="inline-flex h-8 items-center justify-center rounded-item border border-border bg-surface-raised text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50 px-2.5"
          >
            Today
          </button>
          <button
            type="button"
            aria-label={view === 'week' ? 'Next week' : 'Next day'}
            title={view === 'week' ? 'Next week' : 'Next day'}
            onClick={() => setAnchorDay((d) => addDays(d, step))}
            className="inline-flex h-8 items-center justify-center rounded-item border border-border bg-surface-raised text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <h2 data-testid="calendar-title" className="ml-1 min-w-0 truncate text-heading font-semibold text-text-primary">
          {formatRangeTitle(days[0], days[days.length - 1])}
        </h2>

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

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
              open={planOpen}
              onToggle={() => {
                setPlanCollapsed(false)
                setPlanOpen((o) => !o)
              }}
            />
          )}
        </div>
      </header>

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

      <div className="@container/cal relative flex min-h-0 flex-1 gap-3">
        <TimeGrid
          days={days}
          items={items}
          now={now}
          isDimmed={isDimmed}
          isLinked={isLinked}
          activeKey={popover?.mode === 'edit' ? popover.key : undefined}
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
          <button
            type="button"
            onClick={() => setPlanCollapsed(false)}
            className="absolute bottom-3 right-3 z-30 inline-flex h-9 items-center gap-2 rounded-full bg-accent px-3.5 text-body font-medium text-accent-foreground shadow-pop transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Show plan
          </button>
        )}
        {planLayout && !planCollapsed && (
          // Floats over the weekend columns, so Monday to Friday keep their
          // full width; "Hide" tucks it away to see what is under it.
          <div className="absolute inset-y-0 right-0 z-30 flex max-w-full rounded-widget shadow-pop">
            <HelpMePlanPanel
              layout={planLayout}
              weekLabel={weekLabel}
              now={now.getTime()}
              layer={layer}
              todos={todos}
              autofill={autofill}
              onAutofillChange={setAutofill}
              onClose={() => setPlanOpen(false)}
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

      {popover && (
        // Click-away layer: closes the popover without starting a new block.
        <div className="absolute inset-0 z-40" onPointerDown={closePopover} />
      )}
      {popover?.mode === 'create' && (
        <EventPopover
          key={`create-${popover.draft.start.toISOString()}`}
          x={popover.x}
          y={popover.y}
          bounds={bounds}
          initial={popover.draft}
          canEdit
          busy={busy}
          error={error}
          onClose={closePopover}
          onSubmit={(draft) => run(() => createItem.mutateAsync(newItemFromDraft(draft, localTimeZone())))}
        />
      )}
      {popover?.mode === 'edit' && editing && (
        <EventPopover
          key={`edit-${editing.occurrence_key}`}
          x={popover.x}
          y={popover.y}
          bounds={bounds}
          row={editing}
          initial={draftFromRow(editing)}
          canEdit
          busy={busy}
          error={error}
          onClose={closePopover}
          onSubmit={(draft) => {
            const patch = patchFromDraft(editing, draft, localTimeZone())
            if (Object.keys(patch).length === 0) return closePopover()
            void run(() => updateItem.mutateAsync({ id: editing.id, patch }))
          }}
          onDelete={() => run(() => deleteItem.mutateAsync(editing.id))}
          onToggleDone={
            editing.kind === 'commitment'
              ? undefined
              : () => run(() =>
                  editing.status === 'done'
                    ? updateItem.mutateAsync({ id: editing.id, patch: { status: 'open' } })
                    : completeItem.mutateAsync(editing.id),
                )
          }
        >
          {editing.source_type === 'recording' && editing.source_id && (
            <MomentLink
              recordingId={editing.source_id}
              offsetMs={editing.source_offset_ms ?? 0}
              state={popover.moment}
              canShow={!!onShowMoment}
              onShow={() => showMoment(editing, editing.occurrence_key)}
              onShowElsewhere={() => showMoment(editing, editing.occurrence_key, true)}
            />
          )}
        </EventPopover>
      )}
    </div>
  )
}

interface MomentLinkProps {
  recordingId: string
  offsetMs: number
  state?: MomentState
  canShow: boolean
  onShow: () => void
  onShowElsewhere: () => void
}

/** "From: Mitochondrial DNA lecture, 9:00", plus where clicking it took you. */
function MomentLink({ recordingId, offsetMs, state, canShow, onShow, onShowElsewhere }: MomentLinkProps) {
  const substrate = useSubstrate()
  const { data: recording } = substrate.useRecording(recordingId)
  const linkButton = 'inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline'

  return (
    <div data-testid="calendar-moment" className="flex flex-col gap-1.5 rounded-item bg-surface-inset px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5 text-meta text-text-secondary">
        <AudioLines className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="line-clamp-2">
          From: <span className="font-medium text-text-primary">{recording?.title ?? 'a lecture'}</span>, {formatTime(offsetMs)}
        </span>
      </div>
      {state === 'opening' && <span className="text-meta text-text-muted">Opening the moment...</span>}
      {state === 'failed' && (
        <div className="flex flex-col gap-1">
          <span className="text-meta text-text-muted">Couldn't open the moment just now.</span>
          <button type="button" onClick={onShow} className={cn(linkButton, 'self-start')}>
            Try again
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {state === 'shown' && <span className="text-meta text-text-muted">Showing this moment in the Transcript.</span>}
      {state === 'no-viewer' && (
        <div className="flex flex-col gap-1">
          <span className="text-meta text-text-muted">This board has no Transcript.</span>
          <button type="button" onClick={onShowElsewhere} className={cn(linkButton, 'self-start')}>
            Open in a board with Transcript
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {state === 'nowhere' && (
        <span className="text-meta text-text-muted">
          None of your boards has a Transcript yet. Add one from the widget drawer to see this moment.
        </span>
      )}
      {!state && canShow && (
        <button type="button" onClick={onShow} className={cn(linkButton, 'self-start')}>
          Go to this moment
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
