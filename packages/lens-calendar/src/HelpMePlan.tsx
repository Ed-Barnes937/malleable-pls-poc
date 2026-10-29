import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type RefObject } from 'react'
import {
  ASSUMED_ESTIMATE_MIN,
  ESTIMATE_OPTIONS,
  STUDY_PER_DAY_OPTIONS,
  capacityCopy,
  completeTrims,
  draftCopy,
  formatMinutes,
  longestBlockMin,
  openTime,
  planCapacity,
  planTasks,
  rankForPlan,
  leftoverStudyTime,
  noSlotCause,
  studyDays,
  suggestTaskSlots,
  type PlanItemOccurrence,
  type PlanTask,
  type WeekLayout,
} from '@pls/substrate'
import { useSubstrateMutations } from '@pls/lens-framework'
import { cn, doByLabel } from '@pls/shared-ui'
import { CalendarClock, Check, ChevronsRight, GripVertical, Scissors, Sparkles, X } from 'lucide-react'
import { buildAutofillDraft, proposalMinutes, unplacedReason, type AutofillState } from './autofill'
import { toneFor } from './colors'
import type { ProposalLayer } from './proposals'
import { firstFreeStart, formatClock, formatWeekday, startOfDay } from './time'

/** The Help me plan toggle in the week view header. */
export function HelpMePlanButton({ open, onToggle, buttonRef }: {
  open: boolean
  onToggle: () => void
  buttonRef?: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={open}
      aria-label="Help me plan"
      title="Help me plan: fit your to-dos into this week"
      data-testid="help-me-plan"
      onClick={onToggle}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-control border px-3.5 text-body font-medium whitespace-nowrap transition-opacity hover:opacity-90',
        open
          ? 'border-transparent bg-accent text-accent-foreground'
          : 'border-accent-line bg-accent-soft text-accent',
      )}
    >
      <Sparkles className="h-4 w-4" />
      Help me plan
    </button>
  )
}

/** Assigning a to-do was refused because the time overlaps something; `message` is for the student. */
export class ScheduleClash extends Error {}

/** A to-do being dragged from the panel onto the grid. */
export interface DraggedTodo {
  id: string
  title: string
  durationMin: number
  course: string | null
}

export interface HelpMePlanPanelProps {
  layout: WeekLayout
  /** "this week", "next week", "that week". */
  weekLabel: string
  now: number
  layer: ProposalLayer
  /** Open to-dos with no time yet (null while loading). */
  todos: PlanItemOccurrence[] | null
  /** Auto-fill's state, owned by the Calendar so it survives closing the panel. */
  autofill: AutofillState
  onAutofillChange: (next: AutofillState) => void
  onClose: () => void
  /** Tuck the panel away (it overlays the grid in a narrow calendar). */
  onCollapse: () => void
  /**
   * Assign a to-do by hand: saves its block straight away. Rejects with a
   * student-facing message when the time overlaps something.
   */
  onSchedule: (todo: PlanItemOccurrence, start: Date, durationMin: number) => Promise<unknown>
  onDragTodo: (todo: DraggedTodo | null) => void
  /** The "study time per day" setting changed. */
  onStudyMinPerDayChange: (minutes: number) => void
}

type Drafted = Extract<AutofillState, { state: 'drafted' }>

const SOURCE = 'autofill'

/**
 * Help me plan: the week's unscheduled to-dos on one side of the calendar,
 * its free time shaded on the grid, an honest capacity bar, and Auto-fill.
 * Every number here comes from `@pls/scheduler` (via @pls/substrate's
 * planning module); Auto-fill's LLM only ranks, suggests trims and adds a
 * note, and its draft is ghost blocks in the calendar's proposal layer until
 * the student accepts them.
 */
export function HelpMePlanPanel({
  layout, weekLabel, now, layer, todos: loaded, autofill, onAutofillChange: setAutofill,
  onClose, onCollapse, onSchedule, onDragTodo, onStudyMinPerDayChange,
}: HelpMePlanPanelProps) {
  const mutations = useSubstrateMutations()
  const updateItem = mutations.useUpdatePlanItem()
  const autofillPlan = mutations.useAutofillPlan()
  const [rowError, setRowError] = useState<string | null>(null)
  const isLoading = loaded === null
  const todos = useMemo(() => loaded ?? [], [loaded])
  const advisedOrder = autofill.state === 'drafted' ? autofill.advice.order : null
  // Most important first: the draft's order once there is one, else soonest due.
  const tasks = useMemo(() => {
    const list = planTasks(todos, layout.week, { now })
    const rank = new Map((advisedOrder ?? rankForPlan(list)).map((id, i) => [id, i]))
    return list.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
  }, [todos, layout.week, now, advisedOrder])
  const cap = useMemo(() => planCapacity(layout, tasks, now), [layout, tasks, now])
  const missing = todos.filter((t) => t.duration_min == null)
  const over = layout.week.end <= now
  const drafted = autofill.state === 'drafted' ? autofill : null
  const draftHere = drafted?.week === layout.week.start
  const otherDraft = layer.proposals.length > 0 && (!draftHere || layer.source !== SOURCE)

  // The draft ends when its ghosts are all accepted or dismissed.
  useEffect(() => {
    if (drafted && drafted.draft.proposals.length > 0 && layer.proposals.length === 0) setAutofill({ state: 'idle' })
  }, [drafted, layer.proposals.length, setAutofill])

  /** Re-draft (after a trim, or a new study time per day), keeping ghosts the student dragged. */
  const redraft = (from: Drafted, trims: Map<string, number>, keepAdjusted = true) => {
    const pinned = keepAdjusted ? layer.proposals.filter((p) => p.adjusted && !trims.has(p.taskId) && !layer.savedIds.has(p.id)) : []
    const draft = buildAutofillDraft({ todos, layout, now, advice: from.advice, trims, estimates: from.estimates, pinned })
    layer.propose(SOURCE, draft.proposals)
    setAutofill({ ...from, minutesPerDay: layout.budget.minutesPerDay, trims, draft })
  }

  // Changing study time per day during a draft re-drafts it with the new
  // budget; applied trims that no longer fit in a day are dropped.
  const budgetRef = useRef(layout.budget.minutesPerDay)
  useEffect(() => {
    const perDay = layout.budget.minutesPerDay
    if (budgetRef.current === perDay) return
    budgetRef.current = perDay
    if (!drafted || !draftHere) return
    const trims = new Map([...drafted.trims].filter(([, min]) => min <= perDay))
    redraft(drafted, trims, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.budget.minutesPerDay])

  const runAutofill = async (estimates: Record<string, number>) => {
    setAutofill({ state: 'loading' })
    try {
      const advice = await autofillPlan.mutateAsync({
        from: new Date(layout.week.start).toISOString(),
        to: new Date(layout.week.end).toISOString(),
        timeZone: layout.timeZone,
        estimates,
      })
      const trims = new Map<string, number>()
      const draft = buildAutofillDraft({ todos, layout, now, advice, trims, estimates })
      layer.propose(SOURCE, draft.proposals)
      setAutofill({ state: 'drafted', week: layout.week.start, minutesPerDay: layout.budget.minutesPerDay, advice, estimates, trims, draft })
    } catch {
      setAutofill({ state: 'error', message: "Auto-fill didn't work just now. Nothing changed - try again?" })
    }
  }

  const startAutofill = () => {
    if (missing.length > 0) setAutofill({ state: 'confirm-estimates' })
    else void runAutofill({})
  }

  const assumeAndRun = () => {
    void runAutofill(Object.fromEntries(missing.map((t) => [t.id, ASSUMED_ESTIMATE_MIN])))
  }

  /** Apply or undo a suggested trim: re-drafts, keeping ghosts the student dragged. */
  const setTrim = (taskId: string, durationMin: number | null) => {
    if (!drafted) return
    const trims = new Map(drafted.trims)
    if (durationMin == null) trims.delete(taskId)
    else trims.set(taskId, durationMin)
    redraft(drafted, trims)
  }

  const saveEstimate = async (todo: PlanItemOccurrence, durationMin: number) => {
    setRowError(null)
    try {
      await updateItem.mutateAsync({ id: todo.id, patch: { duration_min: durationMin } })
    } catch {
      setRowError(`Couldn't save the estimate for "${todo.title}". Try again?`)
    }
  }

  const schedule = async (todo: PlanItemOccurrence, start: Date, durationMin: number) => {
    setRowError(null)
    try {
      await onSchedule(todo, start, durationMin)
    } catch (e) {
      setRowError(e instanceof ScheduleClash ? e.message : `Couldn't add "${todo.title}" to the calendar. Try again?`)
    }
  }

  // "Pick a time" starts at the first free gap ahead long enough for the to-do
  // (else the first free moment), 15-minute aligned, not "now", and never on
  // a time the draft has already given another to-do.
  const draftBlocks = useMemo(
    () => layer.proposals.filter((p) => !layer.savedIds.has(p.id)).map((p) => ({ start: Date.parse(p.startsAt), end: Date.parse(p.endsAt) })),
    [layer.proposals, layer.savedIds],
  )
  const open = useMemo(() => openTime(layout, now, draftBlocks), [layout, now, draftBlocks])
  const pickDefaultFor = (durationMin: number) => firstFreeStart(open, durationMin) ?? layout.week.start + 9 * 3_600_000

  const ghostFor = (id: string) => layer.proposals.find((p) => p.taskId === id)
  const showDraft = draftHere && drafted ? drafted : null
  const keepPlan = () => {
    layer.dismissAll()
    setAutofill({ state: 'idle' })
  }
  const openDraftBlocks = draftBlocks.length

  // Focus follows the panel: into it when it opens (or is shown again), to the
  // draft when Auto-fill finishes, and back to Auto-fill when the draft ends,
  // so keyboard users never land on the page body.
  const headingId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const draftHeadingRef = useRef<HTMLHeadingElement>(null)
  const autofillRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const prevState = useRef(autofill.state)
  useEffect(() => {
    const prev = prevState.current
    prevState.current = autofill.state
    if (prev === autofill.state) return
    const active = document.activeElement
    const focusIsOurs = !active || active === document.body || !!panelRef.current?.contains(active)
    if (!focusIsOurs) return
    if (autofill.state === 'drafted') draftHeadingRef.current?.focus()
    else if (autofill.state === 'idle' || autofill.state === 'error') autofillRef.current?.focus()
  }, [autofill.state])

  return (
    <aside
      ref={panelRef}
      data-testid="help-me-plan-panel"
      aria-labelledby={headingId}
      className="@container flex h-full min-h-0 w-full flex-col overflow-hidden rounded-widget border border-border-subtle bg-surface-raised"
    >
      <div className="flex items-center gap-1 pb-1 pl-4 pr-2.5 pt-3.5 @max-[17rem]:pl-3 @max-[17rem]:pr-1.5">
        <h3
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-item text-heading font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent @max-[17rem]:gap-1.5 @max-[17rem]:text-title"
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0 text-accent" aria-hidden />
          Plan your time
        </h3>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide the plan to see the calendar"
          title="Hide to see the calendar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Help me plan"
          title="Close"
          className="inline-flex h-8 w-8 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stays put while the rest scrolls, so the numbers are in view as a draft changes them. */}
      <div className="shrink-0 px-4 pb-3 pt-1 @max-[17rem]:px-3 @max-[17rem]:pb-2">
        <CapacityBar
          freeMin={cap.freeMin}
          neededMin={cap.neededMin}
          copy={capacityCopy(cap, weekLabel, layout.budget.minutesPerDay)}
          assumed={missing.length}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-4 @max-[17rem]:gap-3 @max-[17rem]:px-3">
        {!showDraft && (
          <p className="text-body text-text-secondary">
            Drag a to-do onto a free gap, or let Auto-fill draft the rest. Nothing is saved until you accept.
          </p>
        )}

        {showDraft ? (
          <DraftSummary
            autofill={showDraft}
            layer={layer}
            now={now}
            todos={todos}
            minutesPerDay={layout.budget.minutesPerDay}
            overCapacity={!planCapacity(layout, planTasks(todos, layout.week, { now, estimates: showDraft.estimates }), now).fits}
            originalTasks={planTasks(todos, layout.week, { now, estimates: showDraft.estimates })}
            onTrim={setTrim}
            pickDefaultFor={pickDefaultFor}
            onPick={(todo, start, durationMin) => void schedule(todo, start, durationMin)}
            freeMin={cap.freeMin}
            layout={layout}
            headingRef={draftHeadingRef}
          />
        ) : (
          (otherDraft || autofill.state === 'confirm-estimates' || autofill.state === 'error') && (
            <div className="flex flex-col gap-2">
              {otherDraft && (
                <p className="rounded-item bg-surface-inset px-3 py-2 text-meta text-text-secondary">
                  There are suggested blocks waiting in the calendar. Accept them or keep your plan first.
                </p>
              )}
              {autofill.state === 'confirm-estimates' && (
                <div data-testid="estimate-prompt" className="flex flex-col gap-2.5 rounded-item border border-accent-line bg-accent-soft px-3 py-2.5">
                  <p className="text-body text-text-primary">
                    {missing.length === 1 ? '1 to-do has' : `${missing.length} to-dos have`} no estimate yet. Add one below, or
                    I'll assume {formatMinutes(ASSUMED_ESTIMATE_MIN)} each.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {/* The Auto-fill button that asked has gone: focus the answer. */}
                    <button type="button" onClick={assumeAndRun} autoFocus className={primaryButton}>
                      Assume {formatMinutes(ASSUMED_ESTIMATE_MIN)} and Auto-fill
                    </button>
                    <button type="button" onClick={() => setAutofill({ state: 'idle' })} className={quietButton}>Cancel</button>
                  </div>
                </div>
              )}
              {autofill.state === 'error' && (
                <p role="status" className="text-meta text-text-secondary">{autofill.message}</p>
              )}
            </div>
          )
        )}

        <section className="flex flex-col gap-2">
          <h4 className={sectionLabel}>To-dos without a time</h4>
          {rowError && <p role="status" className="text-meta text-text-secondary">{rowError}</p>}
          {isLoading && <p className="text-meta text-text-muted">Loading your to-dos...</p>}
          {!isLoading && todos.length === 0 && (
            <p data-testid="plan-empty" className="rounded-item bg-surface-inset px-3 py-2 text-meta text-text-muted">
              No to-dos waiting for a time. Add one in the To-do widget and it shows up here.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => {
              const todo = todos.find((t) => t.id === task.id)!
              return (
                <TodoRow
                  key={task.id}
                  todo={todo}
                  task={task}
                  now={now}
                  ghost={ghostFor(task.id)?.startsAt}
                  suggestions={over || ghostFor(task.id) ? [] : suggestTaskSlots(task, layout, { now, n: 3 })}
                  onEstimate={(min) => void saveEstimate(todo, min)}
                  onPick={(start) => void schedule(todo, start, task.durationMin)}
                  onDragTodo={onDragTodo}
                  pickDefault={pickDefaultFor(task.durationMin)}
                />
              )
            })}
          </ul>
        </section>

        <FreeTime layout={layout} now={now} onStudyMinPerDayChange={onStudyMinPerDayChange} />
      </div>

      {showDraft ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle px-4 pb-4 pt-3 @max-[17rem]:flex-nowrap @max-[17rem]:gap-1 @max-[17rem]:px-3 @max-[17rem]:pb-3">
          <button
            type="button"
            onClick={() => void layer.acceptAll()}
            disabled={layer.saving || openDraftBlocks === 0}
            className={cn(primaryButton, 'flex-1 justify-center gap-1.5 whitespace-nowrap px-3')}
          >
            <Check className="h-4 w-4 @max-[17rem]:hidden" />
            Accept draft
          </button>
          <button type="button" onClick={keepPlan} disabled={layer.saving} className={cn(ghostButton, 'whitespace-nowrap')}>
            Keep my plan
          </button>
        </div>
      ) : autofill.state !== 'confirm-estimates' && (
        <div className="flex shrink-0 border-t border-border-subtle px-4 pb-4 pt-3 @max-[17rem]:px-3 @max-[17rem]:pb-3">
          <button
            ref={autofillRef}
            type="button"
            data-testid="autofill"
            onClick={startAutofill}
            disabled={over || tasks.length === 0 || autofill.state === 'loading' || otherDraft}
            className={cn(primaryButton, 'flex-1 justify-center')}
          >
            <Sparkles className={cn('h-4 w-4', autofill.state === 'loading' && 'animate-pulse')} />
            {autofill.state === 'loading' ? 'Drafting your week...' : 'Auto-fill'}
          </button>
        </div>
      )}
    </aside>
  )
}

const primaryButton = 'inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
const quietButton = 'inline-flex h-8 items-center gap-1.5 rounded-item border border-border bg-surface-raised px-2.5 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50'
const ghostButton = 'inline-flex h-10 items-center rounded-control px-2 text-body whitespace-nowrap font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50'
const linkButton = 'font-semibold text-accent hover:underline'
const sectionLabel = 'text-meta font-semibold text-text-muted'

/**
 * The capacity headline (naming the daily cap Auto-fill drafts with) and a
 * bar: study time left in the accent, any shortfall hatched in amber.
 */
function CapacityBar({ freeMin, neededMin, copy, assumed }: { freeMin: number; neededMin: number; copy: string; assumed: number }) {
  const scale = Math.max(freeMin, neededMin, 1)
  const fitting = Math.min(freeMin, neededMin)
  const short = Math.max(0, neededMin - freeMin)
  return (
    <div data-testid="plan-capacity" className="flex flex-col gap-2.5 rounded-item border border-border-subtle bg-surface-inset px-3.5 py-3 @max-[17rem]:gap-2 @max-[17rem]:px-3 @max-[17rem]:py-2.5">
      <p className="text-title font-semibold text-text-primary @max-[17rem]:text-body">{copy}</p>
      <div
        role="img"
        aria-label={`${formatMinutes(freeMin)} of study time left, ${formatMinutes(neededMin)} needed`}
        className="relative flex h-2 overflow-hidden rounded-full bg-surface-overlay"
      >
        <span className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(fitting / scale) * 100}%` }} />
        {short > 0 && (
          <span data-testid="plan-shortfall" className="h-full hatch-attn transition-[width] duration-300" style={{ width: `${(short / scale) * 100}%` }} />
        )}
      </div>
      <p data-testid="plan-capacity-numbers" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-muted">
        <span><span className="font-semibold text-text-secondary">{formatMinutes(freeMin)}</span> free</span>
        <span><span className="font-semibold text-text-secondary">{formatMinutes(neededMin)}</span> to do</span>
        {short > 0 && <span className="font-semibold text-attn">{formatMinutes(short)} short</span>}
      </p>
      {assumed > 0 && (
        <p className="text-meta text-text-muted">
          Counting {formatMinutes(ASSUMED_ESTIMATE_MIN)} for {assumed === 1 ? 'the to-do' : `the ${assumed} to-dos`} with no estimate.
        </p>
      )}
    </div>
  )
}

/**
 * Auto-fill's draft: its note, a Shrink offer for anything too long (no
 * splitting: one to-do is one block), the drafted blocks in time order, and
 * what didn't fit, each with "Pick a time". Accept draft and Keep my plan
 * sit in the panel's footer.
 */
function DraftSummary({
  autofill,
  layer,
  now,
  todos,
  onTrim,
  minutesPerDay,
  overCapacity,
  originalTasks,
  pickDefaultFor,
  onPick,
  freeMin,
  layout,
  headingRef,
}: {
  /** The week planned: what the leftover study time is measured against. */
  layout: WeekLayout
  /** Study time left, as the capacity headline counts it. */
  freeMin: number
  /** Focused when Auto-fill finishes. */
  headingRef: RefObject<HTMLHeadingElement | null>
  minutesPerDay: number
  overCapacity: boolean
  now: number
  /** Open to-dos with no time yet: one picked by hand leaves "didn't fit". */
  todos: PlanItemOccurrence[]
  /** The to-dos as they are (before any trim the student applied). */
  originalTasks: PlanTask[]
  autofill: Drafted
  layer: ProposalLayer
  onTrim: (taskId: string, durationMin: number | null) => void
  pickDefaultFor: (durationMin: number) => number
  onPick: (todo: PlanItemOccurrence, start: Date, durationMin: number) => void
}) {
  const { advice, draft, trims, estimates } = autofill
  const [picking, setPicking] = useState<string | null>(null)
  // Shrink and Undo replace each other, so the one just pressed unmounts:
  // hand focus to its replacement (Undo after Shrink, Shrink after Undo).
  const rootRef = useRef<HTMLDivElement>(null)
  const focusAfterTrim = useRef<{ taskId: string; action: 'shrink' | 'undo' } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const trimTask = (taskId: string, durationMin: number | null) => {
    focusAfterTrim.current = { taskId, action: durationMin === null ? 'shrink' : 'undo' }
    const name = draft.tasks.find((t) => t.id === taskId)?.title ?? 'a to-do'
    setAnnouncement(durationMin === null ? `Undid the shrink of ${name}.` : `Shrunk ${name} to ${formatMinutes(durationMin)}.`)
    onTrim(taskId, durationMin)
  }
  useLayoutEffect(() => {
    const pending = focusAfterTrim.current
    if (!pending) return
    const next = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-trim-action]') ?? [])]
      .find((el) => el.dataset.trimAction === pending.action && el.dataset.taskId === pending.taskId)
    focusAfterTrim.current = null
    next?.focus()
  }, [trims, autofill])
  const title = (id: string) => draft.tasks.find((t) => t.id === id)?.title ?? 'a to-do'
  const assumed = Object.keys(estimates).map(title)
  const blocks = layer.proposals.filter((p) => !layer.savedIds.has(p.id))
  // Every to-do too long for one day gets a trim offer, at the current budget.
  // With no study time left nothing can fit, however short: no Shrink offers.
  const offers = freeMin > 0 ? completeTrims(advice.trims, originalTasks, { overCapacity, minutesPerDay }) : []
  const shown = [
    ...offers,
    // Applied trims stay listed (with Undo) even if the offer moved on.
    ...[...trims].filter(([id]) => !offers.some((t) => t.taskId === id)).map(([taskId, durationMin]) => ({ taskId, durationMin, reason: '' })),
  ]
  const longest = longestBlockMin(minutesPerDay)
  const unplaced = draft.unplaced.filter((u) => todos.some((t) => t.id === u.taskId))
  // The numbers come from the draft itself, so they always match the ghosts.
  const unplacedMin = unplaced.reduce((sum, u) => sum + u.task.durationMin, 0)
  const placedMin = proposalMinutes(layer.proposals)
  // Study time the headline counts that the draft left unused, by why: gaps too short, or days with too little left.
  const drafted = layer.proposals.map((p) => ({ start: Date.parse(p.startsAt), end: Date.parse(p.endsAt) }))
  const leftover = leftoverStudyTime(layout, now, drafted, unplaced.map((u) => ({ durationMin: u.task.durationMin, reason: u.reason })))
  const summary = draftCopy(placedMin, unplacedMin, leftover, unplaced.length)

  return (
    <div ref={rootRef} data-testid="autofill-draft" className="flex flex-col gap-3.5">
      {/* Always mounted, so a screen reader announces what Shrink and Undo did. */}
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

      {shown.map((trim) => {
        const applied = trims.has(trim.taskId)
        const task = originalTasks.find((t) => t.id === trim.taskId)
        const tooLong = !!task && task.durationMin > longest
        return (
          <div key={trim.taskId} data-testid="autofill-trim" className="flex flex-col gap-2.5 rounded-item border border-attn-line bg-attn-soft px-3.5 py-3 @max-[17rem]:gap-2 @max-[17rem]:px-3 @max-[17rem]:py-2.5">
            {applied ? (
              // Undo runs on after the sentence, as a link, so the draft under it stays in view.
              <p className="text-body text-text-primary">
                <Scissors className="mr-1.5 inline h-4 w-4 align-[-3px] text-attn" aria-hidden />
                Shrunk <span className="font-semibold">{title(trim.taskId)}</span> to {formatMinutes(trims.get(trim.taskId)!)}.{' '}
                <button
                  type="button"
                  data-trim-action="undo"
                  data-task-id={trim.taskId}
                  onClick={() => trimTask(trim.taskId, null)}
                  className={cn(linkButton, 'rounded-item outline-none focus-visible:ring-2 focus-visible:ring-accent')}
                >
                  Undo
                </button>
              </p>
            ) : (
              <>
                <p className="text-body text-text-primary">
                  <span className="font-semibold">{title(trim.taskId)}</span>
                  {task && ` (${formatMinutes(task.durationMin)})`}
                  {tooLong ? ' is too long for one day.' : ' could be shorter, so more fits.'}
                </p>
                {!tooLong && trim.reason && <p className="text-meta font-medium text-attn">{trim.reason}</p>}
                <button type="button" data-trim-action="shrink" data-task-id={trim.taskId} onClick={() => trimTask(trim.taskId, trim.durationMin)} className={cn(quietButton, 'self-start')}>
                  <Scissors className="h-3.5 w-3.5" />
                  Shrink to {formatMinutes(trim.durationMin)}
                </button>
              </>
            )}
          </div>
        )
      })}

      <section className="flex flex-col gap-1.5">
        <h4 ref={headingRef} tabIndex={-1} className={cn(sectionLabel, 'rounded-item outline-none focus-visible:ring-2 focus-visible:ring-accent')}>
          {blocks.length === 0 ? 'Draft' : `Draft · ${blocks.length === 1 ? '1 block' : `${blocks.length} blocks`}`}
        </h4>
        <p data-testid="autofill-summary" className="text-meta text-text-secondary">{summary}</p>
        <ul className={cn('flex flex-col gap-1.5', blocks.length === 0 && 'hidden')}>
          {blocks.map((p) => (
            <li
              key={p.id}
              data-testid="autofill-block"
              className="flex items-center gap-2.5 rounded-item border-[1.5px] border-dashed border-border px-2.5 py-1.5"
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', toneFor(p.course ?? null).bar)} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary" title={p.title}>{p.title}</span>
              <span className="shrink-0 text-meta tabular-nums text-text-muted">{slotLabel(Date.parse(p.startsAt), now)}</span>
            </li>
          ))}
        </ul>
      </section>

      {advice.note && <p data-testid="autofill-note" className="text-meta text-text-secondary">{advice.note}</p>}

      {unplaced.length > 0 && (
        <div data-testid="autofill-unplaced" className="flex flex-col gap-1.5 text-meta text-text-secondary">
          {unplaced.map((u) => {
            const todo = todos.find((t) => t.id === u.taskId)!
            return (
              <div key={u.taskId} className="flex flex-col gap-1.5">
                <p>
                  {u.task.title} ({formatMinutes(u.task.durationMin)}) didn't fit: {unplacedReason(u.reason, minutesPerDay, u.reason === 'no-free-slot' ? noSlotCause(layout, now, drafted, u.task.durationMin) : undefined)}.{' '}
                  <button
                    type="button"
                    onClick={() => setPicking((id) => (id === u.taskId ? null : u.taskId))}
                    aria-label={`Pick a time for ${u.task.title}`}
                    className={linkButton}
                  >
                    Pick a time
                  </button>
                </p>
                {picking === u.taskId && (
                  <PickTime
                    title={u.task.title}
                    defaultStart={pickDefaultFor(u.task.durationMin)}
                    onPick={(start) => {
                      setPicking(null)
                      onPick(todo, start, u.task.durationMin)
                    }}
                    onCancel={() => setPicking(null)}
                    className=""
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
      {assumed.length > 0 && (
        <p className="text-meta text-text-muted">
          Assumed {formatMinutes(ASSUMED_ESTIMATE_MIN)} for {assumed.join(', ')}, which had no estimate. Drag a block's edge to change it.
        </p>
      )}

      {layer.error && <p role="status" className="text-meta text-text-secondary">{layer.error}</p>}
    </div>
  )
}

function TodoRow({
  todo,
  task,
  now,
  ghost,
  suggestions,
  onEstimate,
  onPick,
  onDragTodo,
  pickDefault,
}: {
  todo: PlanItemOccurrence
  task: PlanTask
  now: number
  /** Where "Pick a time" starts: the first free gap that fits it. */
  pickDefault: number
  /** Where its draft ghost is, if it has one. */
  ghost?: string
  suggestions: { start: number }[]
  onEstimate: (min: number) => void
  onPick: (start: Date) => void
  onDragTodo: (todo: DraggedTodo | null) => void
}) {
  const tone = toneFor(todo.course)
  const [picking, setPicking] = useState(false)
  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', todo.title)
    e.dataTransfer.effectAllowed = 'move'
    onDragTodo({ id: todo.id, title: todo.title, durationMin: task.durationMin, course: todo.course })
  }

  return (
    <li
      data-testid="plan-todo"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => onDragTodo(null)}
      className="group flex cursor-grab flex-col gap-2 rounded-item border border-border-subtle bg-surface-raised px-2.5 py-2.5 transition-colors hover:border-accent-line active:cursor-grabbing"
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', tone.bar)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text-primary" title={todo.title}>{todo.title}</p>
          <p className="text-meta text-text-muted">
            {todo.due_at ? doByLabel(todo.due_at, now) : 'No due date'}
            {task.weakTopic && ' · from a confusing moment'}
          </p>
        </div>
        {todo.duration_min != null && (
          <span className="shrink-0 rounded-full bg-surface-overlay px-2 py-0.5 text-meta font-semibold tabular-nums text-text-secondary">
            {formatMinutes(todo.duration_min)}
          </span>
        )}
      </div>

      {todo.duration_min == null && (
        <div data-testid="plan-estimate" className="flex flex-wrap items-center gap-1.5 pl-[22px]">
          <span className="text-meta text-text-muted">How long?</span>
          {ESTIMATE_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => onEstimate(min)}
              aria-label={`Estimate ${formatMinutes(min)} for ${todo.title}`}
              className="h-7 rounded-item border border-accent-line bg-accent-soft px-2 text-meta font-semibold text-accent transition-opacity hover:opacity-85"
            >
              {formatMinutes(min)}
            </button>
          ))}
        </div>
      )}

      {ghost ? (
        <p className="flex items-center gap-1 pl-[22px] text-meta font-semibold text-accent">
          <Sparkles className="h-3 w-3" />
          Suggested {slotLabel(Date.parse(ghost), now)}
        </p>
      ) : suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-[22px]">
          <CalendarClock className="h-3.5 w-3.5 text-text-muted" aria-hidden />
          {suggestions.map((s) => (
            <button
              key={s.start}
              type="button"
              data-testid="plan-suggestion"
              onClick={() => onPick(new Date(s.start))}
              aria-label={`Schedule ${todo.title} ${slotLabel(s.start, now)}`}
              title={`Add to the calendar ${slotLabel(s.start, now)}`}
              className="h-7 rounded-item bg-surface-overlay px-2 text-meta font-semibold tabular-nums text-text-primary transition-colors hover:bg-accent-soft hover:text-accent"
            >
              {slotLabel(s.start, now)}
            </button>
          ))}
          <button type="button" onClick={() => setPicking((v) => !v)} className={pickButton}>Other time</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 pl-[22px]">
          <CalendarClock className="h-3.5 w-3.5 text-text-muted" aria-hidden />
          <span className="text-meta text-text-muted">No free slot fits as it is.</span>
          <button type="button" onClick={() => setPicking((v) => !v)} className={pickButton}>Pick a time</button>
        </div>
      )}
      {picking && !ghost && (
        <PickTime
          title={todo.title}
          defaultStart={pickDefault}
          onPick={(start) => {
            setPicking(false)
            onPick(start)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </li>
  )
}

const pickButton = 'h-7 rounded-item border border-border bg-surface-raised px-2 text-meta font-semibold text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary'

const pad2 = (n: number) => String(n).padStart(2, '0')
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Keyboard-friendly way to give a to-do a time without dragging. */
function PickTime({ title, defaultStart, onPick, onCancel, className = 'pl-[22px]' }: {
  title: string
  defaultStart: number
  onPick: (start: Date) => void
  onCancel: () => void
  className?: string
}) {
  const [value, setValue] = useState(() => toLocalInput(defaultStart))
  // The button that opened it (focused when this first renders): cancelling hands focus back.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const cancel = () => {
    onCancel()
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const start = new Date(value)
    if (!Number.isNaN(start.getTime())) onPick(start)
  }
  return (
    <form onSubmit={submit} className={cn('flex flex-wrap items-center gap-1.5', className)} onKeyDown={(e) => e.key === 'Escape' && cancel()}>
      <input
        type="datetime-local"
        step={900}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Start time for ${title}`}
        autoFocus
        className="h-7 rounded-item border border-border bg-surface-inset px-2 text-meta text-text-primary"
      />
      <button type="submit" className="h-7 rounded-item bg-accent px-2.5 text-meta font-semibold text-accent-foreground hover:opacity-90">Add</button>
      <button type="button" onClick={cancel} className={pickButton}>Cancel</button>
    </form>
  )
}

function slotLabel(start: number, now: number): string {
  const d = new Date(start)
  const day = startOfDay(d).getTime() === startOfDay(new Date(now)).getTime() ? 'Today' : formatWeekday(d)
  return `${day} ${formatClock(d)}`
}

/**
 * Study time left per day (the budget minus study already scheduled, never
 * more than the free time), with the "study time per day" setting.
 */
function FreeTime({
  layout,
  now,
  onStudyMinPerDayChange,
}: {
  layout: WeekLayout
  now: number
  /** Omitted while a draft is open (changing it would not re-draft). */
  onStudyMinPerDayChange?: (minutes: number) => void
}) {
  const days = useMemo(
    () => studyDays(layout, now).map((d) => ({ ...d, label: formatWeekday(new Date(d.day)), past: d.day + 24 * 3_600_000 <= now })),
    [layout, now],
  )
  const perDay = layout.budget.minutesPerDay
  const options = (STUDY_PER_DAY_OPTIONS as readonly number[]).includes(perDay) ? STUDY_PER_DAY_OPTIONS : [...STUDY_PER_DAY_OPTIONS, perDay].sort((a, b) => a - b)

  return (
    <section data-testid="plan-free-time" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className={sectionLabel}>Study time left</h4>
        <label className="flex items-center gap-1.5 text-meta text-text-muted">
          Up to
          <select
            aria-label="Study time per day"
            value={perDay}
            disabled={!onStudyMinPerDayChange}
            onChange={(e) => onStudyMinPerDayChange?.(Number(e.target.value))}
            className="h-7 rounded-item border border-border bg-surface-inset px-1.5 text-meta font-semibold text-text-primary disabled:opacity-60"
          >
            {options.map((min) => <option key={min} value={min}>{formatMinutes(min)}</option>)}
          </select>
          a day
        </label>
      </div>
      <ul className="flex flex-col gap-1.5">
        {days.map((d) => (
          <li
            key={d.day}
            title={d.past ? undefined : `${formatMinutes(d.leftMin)} of study time left (${formatMinutes(d.freeMin)} free)`}
            className={cn('flex items-center gap-2 text-meta', d.past && 'opacity-50')}
          >
            <span className="w-8 shrink-0 font-medium text-text-secondary">{d.label}</span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-overlay">
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(1, d.leftMin / perDay) * 100}%` }} />
            </span>
            <span className="w-12 shrink-0 text-right tabular-nums text-text-muted">
              {d.past ? '-' : d.leftMin > 0 ? formatMinutes(d.leftMin) : d.freeMin > 0 ? 'full' : 'busy'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
