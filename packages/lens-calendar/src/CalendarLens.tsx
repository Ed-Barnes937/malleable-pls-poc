import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlanItemOccurrence } from '@pls/substrate'
import { type LensProps, type DateRange, type ShowMomentResult, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, cn, formatTime } from '@pls/shared-ui'
import { ArrowUpRight, AudioLines, ChevronLeft, ChevronRight } from 'lucide-react'
import { TimeGrid, type Anchor } from './TimeGrid'
import { EventPopover } from './EventPopover'
import { HelpMePlan } from './HelpMePlan'
import { draftFromRow, movePatch, newItemFromDraft, patchFromDraft, type Draft } from './drafts'
import { toneFor } from './colors'
import { addDays, formatRangeTitle, localTimeZone, startOfDay, startOfWeek } from './time'

type View = 'week' | 'day'

type Popover =
  | { mode: 'create'; x: number; y: number; draft: Draft }
  | { mode: 'edit'; x: number; y: number; key: string; moment?: MomentState }

/** Where a block's lecture moment went after clicking it. */
type MomentState = 'opening' | ShowMomentResult | 'nowhere'

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
  const rootRef = useRef<HTMLDivElement>(null)

  const setView = (next: View) => {
    setViewState(next)
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

  const isDimmed = useCallback(
    (item: PlanItemOccurrence) => !!highlight?.courseTag && item.course !== highlight.courseTag,
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
    const result = await onShowMoment(
      { recordingId: item.source_id, offsetMs: item.source_offset_ms ?? 0 },
      elsewhere ? { elsewhere: true } : undefined,
    )
    const moment: MomentState = elsewhere && result === 'no-viewer' ? 'nowhere' : result
    setPopover((p) => (p?.mode === 'edit' && p.key === key ? { ...p, moment } : p))
  }

  const handleOpen = (item: PlanItemOccurrence, anchor: Anchor) => {
    setError(null)
    setPopover({ mode: 'edit', ...relative(anchor), key: item.occurrence_key })
    // Clicking a block that came from a lecture moment lands on that moment.
    if (item.source_type === 'recording' && item.source_id) void showMoment(item, item.occurrence_key)
  }

  const handleCreate = (start: Date, end: Date, anchor: Anchor) => {
    setError(null)
    setPopover({
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
    updateItem.mutateAsync({ id: item.id, patch }).catch(() => {
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
      setPopover(null)
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

  return (
    <div ref={rootRef} data-testid="calendar" className="relative flex h-full min-h-0 flex-col gap-2.5 pt-1">
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex items-center rounded-lg ring-1 ring-border-subtle">
          <button
            type="button"
            aria-label={view === 'week' ? 'Previous week' : 'Previous day'}
            title={view === 'week' ? 'Previous week' : 'Previous day'}
            onClick={() => setAnchorDay((d) => addDays(d, -step))}
            className="rounded-l-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorDay(today)}
            disabled={showingToday && view === 'day'}
            className="border-x border-border-subtle px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            Today
          </button>
          <button
            type="button"
            aria-label={view === 'week' ? 'Next week' : 'Next day'}
            title={view === 'week' ? 'Next week' : 'Next day'}
            onClick={() => setAnchorDay((d) => addDays(d, step))}
            className="rounded-r-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <h2 data-testid="calendar-title" className="min-w-0 truncate text-sm font-semibold text-text-primary">
          {formatRangeTitle(days[0], days[days.length - 1])}
        </h2>

        {highlight?.courseTag && (
          <span
            data-testid="calendar-highlight"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-overlay/70 px-2 py-0.5 text-[10px] font-medium text-text-secondary ring-1 ring-border-subtle"
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', toneFor(highlight.courseTag).bar)} />
            {courseLabel(highlight.courseTag)} highlighted
          </span>
        )}

        {!isLoading && items.length === 0 && (
          <span className="text-[11px] text-text-muted">Nothing planned. Click or drag on the grid to add something.</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div role="tablist" aria-label="Calendar view" className="flex rounded-lg bg-surface-overlay/60 p-0.5">
            {(['week', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  view === v ? 'bg-accent/15 text-accent ring-1 ring-accent/30' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {v === 'week' ? 'Week' : 'Day'}
              </button>
            ))}
          </div>
          {view === 'week' && <HelpMePlan week={range} items={items} />}
        </div>
      </header>

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
      />

      {popover && (
        // Click-away layer: closes the popover without starting a new block.
        <div className="absolute inset-0 z-40" onPointerDown={() => setPopover(null)} />
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
          onClose={() => setPopover(null)}
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
          onClose={() => setPopover(null)}
          onSubmit={(draft) => {
            const patch = patchFromDraft(editing, draft, localTimeZone())
            if (Object.keys(patch).length === 0) return setPopover(null)
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
  const linkButton = 'inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline'

  return (
    <div data-testid="calendar-moment" className="flex flex-col gap-1.5 rounded-xl bg-surface-overlay/60 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-secondary">
        <AudioLines className="h-3 w-3 shrink-0 text-accent" />
        <span className="line-clamp-2">
          From: <span className="font-medium text-text-primary">{recording?.title ?? 'a lecture'}</span>, {formatTime(offsetMs)}
        </span>
      </div>
      {state === 'opening' && <span className="text-[11px] text-text-muted">Opening the moment...</span>}
      {state === 'shown' && <span className="text-[11px] text-text-muted">Showing this moment in the Transcript.</span>}
      {state === 'no-viewer' && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">This board has no Transcript.</span>
          <button type="button" onClick={onShowElsewhere} className={cn(linkButton, 'self-start')}>
            Open in a board with Transcript
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      )}
      {state === 'nowhere' && (
        <span className="text-[11px] text-text-muted">
          None of your boards has a Transcript yet. Add one from the widget drawer to see this moment.
        </span>
      )}
      {!state && canShow && (
        <button type="button" onClick={onShow} className={cn(linkButton, 'self-start')}>
          Go to this moment
          <ArrowUpRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
