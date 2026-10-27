import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import {
  ASSUMED_ESTIMATE_MIN,
  ESTIMATE_OPTIONS,
  STUDY_PER_DAY_OPTIONS,
  capacityCopy,
  completeTrims,
  draftCopy,
  formatMinutes,
  openTime,
  planCapacity,
  planTasks,
  rankForPlan,
  studyDays,
  suggestTaskSlots,
  type PlanItemOccurrence,
  type PlanTask,
  type WeekLayout,
} from '@pls/substrate'
import { useSubstrateMutations } from '@pls/lens-framework'
import { cn, dayLabel } from '@pls/shared-ui'
import { CalendarClock, ChevronsRight, GripVertical, Scissors, Sparkles, Undo2, X } from 'lucide-react'
import { buildAutofillDraft, proposalMinutes, unplacedReason, type AutofillState } from './autofill'
import { toneFor } from './colors'
import type { ProposalLayer } from './proposals'
import { firstFreeStart, formatClock, formatWeekday, startOfDay } from './time'

/** The Help me plan toggle in the week view header. */
export function HelpMePlanButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={open}
      aria-label="Help me plan"
      title="Help me plan: fit your to-dos into this week"
      data-testid="help-me-plan"
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors',
        open
          ? 'bg-accent text-accent-foreground ring-accent hover:bg-accent/90'
          : 'bg-accent/12 text-accent ring-accent/25 hover:bg-accent/18',
      )}
    >
      <Sparkles className="h-3 w-3" />
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
        studyMinPerDay: layout.budget.minutesPerDay,
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
  // (else the first free moment), 15-minute aligned, not "now".
  const open = useMemo(() => openTime(layout, now), [layout, now])
  const pickDefaultFor = (durationMin: number) => firstFreeStart(open, durationMin) ?? layout.week.start + 9 * 3_600_000

  const ghostFor = (id: string) => layer.proposals.find((p) => p.taskId === id)

  return (
    <aside
      data-testid="help-me-plan-panel"
      aria-label="Help me plan"
      className="flex h-full min-h-0 w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-raised"
    >
      <div className="flex items-start gap-2 border-b border-border-subtle px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-text-primary">Plan {weekLabel}</h3>
          <p className="text-[11px] leading-snug text-text-muted">Drag a to-do onto the calendar, pick a suggested time, or let Auto-fill draft the rest.</p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide the plan to see the calendar"
          title="Hide to see the calendar"
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary @[760px]/cal:hidden"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Help me plan"
          title="Close"
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <CapacityBar freeMin={cap.freeMin} neededMin={cap.neededMin} copy={capacityCopy(cap, weekLabel)} assumed={missing.length} />

        {draftHere && drafted ? (
          <DraftSummary
            autofill={drafted}
            layer={layer}
            minutesPerDay={layout.budget.minutesPerDay}
            overCapacity={!planCapacity(layout, planTasks(todos, layout.week, { now, estimates: drafted.estimates }), now).fits}
            originalTasks={planTasks(todos, layout.week, { now, estimates: drafted.estimates })}
            onTrim={setTrim}
            onKeepPlan={() => {
              layer.dismissAll()
              setAutofill({ state: 'idle' })
            }}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {otherDraft && (
              <p className="rounded-lg bg-surface-overlay/70 px-2.5 py-2 text-[11px] text-text-secondary">
                There are suggested blocks waiting in the calendar. Accept them or keep your plan first.
              </p>
            )}
            {autofill.state === 'confirm-estimates' ? (
              <div data-testid="estimate-prompt" className="flex flex-col gap-2 rounded-xl bg-accent/8 px-3 py-2.5 ring-1 ring-accent/20">
                <p className="text-[11px] leading-snug text-text-primary">
                  {missing.length === 1 ? '1 to-do has' : `${missing.length} to-dos have`} no estimate yet. Add one below, or
                  I'll assume {formatMinutes(ASSUMED_ESTIMATE_MIN)} each.
                </p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={assumeAndRun} className={primaryButton}>
                    Assume {formatMinutes(ASSUMED_ESTIMATE_MIN)} and Auto-fill
                  </button>
                  <button type="button" onClick={() => setAutofill({ state: 'idle' })} className={quietButton}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                data-testid="autofill"
                onClick={startAutofill}
                disabled={over || tasks.length === 0 || autofill.state === 'loading' || otherDraft}
                className={cn(primaryButton, 'justify-center py-1.5 text-[12px]')}
              >
                <Sparkles className={cn('h-3.5 w-3.5', autofill.state === 'loading' && 'animate-pulse')} />
                {autofill.state === 'loading' ? 'Drafting your week...' : 'Auto-fill'}
              </button>
            )}
            {autofill.state === 'error' && (
              <p role="status" className="text-[11px] text-text-secondary">{autofill.message}</p>
            )}
          </div>
        )}

        <section className="flex flex-col gap-1.5">
          <h4 className={sectionLabel}>To-dos without a time</h4>
          {rowError && <p role="status" className="text-[11px] text-text-secondary">{rowError}</p>}
          {isLoading && <p className="text-[11px] text-text-muted">Loading your to-dos...</p>}
          {!isLoading && todos.length === 0 && (
            <p data-testid="plan-empty" className="rounded-lg bg-surface-overlay/50 px-2.5 py-2 text-[11px] text-text-muted">
              No to-dos waiting for a time. Add one in the To-do widget and it shows up here.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
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
    </aside>
  )
}

const primaryButton = 'inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50'
const quietButton = 'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-border-subtle transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50'
const sectionLabel = 'text-[10px] font-semibold uppercase tracking-wider text-text-muted'

function CapacityBar({ freeMin, neededMin, copy, assumed }: { freeMin: number; neededMin: number; copy: string; assumed: number }) {
  const scale = Math.max(freeMin, neededMin, 1)
  const fitting = Math.min(freeMin, neededMin)
  const overflow = Math.max(0, neededMin - freeMin)
  return (
    <div data-testid="plan-capacity" className="flex flex-col gap-1.5">
      <p className="text-[12px] font-medium leading-snug text-text-primary">{copy}</p>
      <div
        role="img"
        aria-label={`${formatMinutes(freeMin)} of study time left, ${formatMinutes(neededMin)} needed`}
        className="relative flex h-2 overflow-hidden rounded-full bg-sky-400/15"
      >
        <span className="h-full bg-accent/80 transition-[width] duration-300" style={{ width: `${(fitting / scale) * 100}%` }} />
        {overflow > 0 && (
          <span className="h-full bg-amber-400/70 transition-[width] duration-300" style={{ width: `${(overflow / scale) * 100}%` }} />
        )}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-400/60" />Study time {formatMinutes(freeMin)}</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent/80" />To-dos {formatMinutes(neededMin)}</span>
        {overflow > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />{formatMinutes(overflow)} over</span>}
      </div>
      {assumed > 0 && (
        <p className="text-[10px] text-text-muted">
          Counting {formatMinutes(ASSUMED_ESTIMATE_MIN)} for {assumed === 1 ? 'the to-do' : `the ${assumed} to-dos`} with no estimate.
        </p>
      )}
    </div>
  )
}

function DraftSummary({
  autofill,
  layer,
  onTrim,
  onKeepPlan,
  minutesPerDay,
  overCapacity,
  originalTasks,
}: {
  minutesPerDay: number
  overCapacity: boolean
  /** The to-dos as they are (before any trim the student applied). */
  originalTasks: PlanTask[]
  autofill: Drafted
  layer: ProposalLayer
  onTrim: (taskId: string, durationMin: number | null) => void
  onKeepPlan: () => void
}) {
  const { advice, draft, trims, estimates } = autofill
  const title = (id: string) => draft.tasks.find((t) => t.id === id)?.title ?? 'a to-do'
  const assumed = Object.keys(estimates).map(title)
  const open = layer.proposals.filter((p) => !layer.savedIds.has(p.id)).length
  // Every to-do too long for one day gets a trim offer, at the current budget.
  const offers = completeTrims(advice.trims, originalTasks, { overCapacity, minutesPerDay })
  const shown = [
    ...offers,
    // Applied trims stay listed (with Undo) even if the offer moved on.
    ...[...trims].filter(([id]) => !offers.some((t) => t.taskId === id)).map(([taskId, durationMin]) => ({ taskId, durationMin, reason: '' })),
  ]
  // The numbers come from the draft itself, so they always match the ghosts.
  const unplacedMin = draft.unplaced.reduce((sum, u) => sum + u.task.durationMin, 0)
  const summary = draftCopy(proposalMinutes(layer.proposals), unplacedMin)

  return (
    <div data-testid="autofill-draft" className="flex flex-col gap-2 rounded-xl bg-accent/[0.07] px-3 py-2.5 ring-1 ring-accent/20">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
        <Sparkles className="h-3 w-3" />
        Draft: {open === 1 ? '1 block' : `${open} blocks`} to look over
      </div>
      <p data-testid="autofill-summary" className="text-[11px] font-medium leading-snug text-text-primary">{summary}</p>
      {advice.note && <p data-testid="autofill-note" className="text-[11px] leading-snug text-text-secondary">{advice.note}</p>}

      {shown.map((trim) => {
        const applied = trims.has(trim.taskId)
        const task = originalTasks.find((t) => t.id === trim.taskId)
        return (
          <div key={trim.taskId} data-testid="autofill-trim" className="flex flex-col gap-1 rounded-lg bg-surface-raised/80 px-2.5 py-2 ring-1 ring-border-subtle">
            {applied ? (
              <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                <Scissors className="h-3 w-3 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">Shrunk "{title(trim.taskId)}" to {formatMinutes(trims.get(trim.taskId)!)}.</span>
                <button type="button" onClick={() => onTrim(trim.taskId, null)} className={quietButton}>
                  <Undo2 className="h-3 w-3" />
                  Undo
                </button>
              </div>
            ) : (
              <>
                <p className="text-[11px] font-medium leading-snug text-text-primary">
                  Shrink "{title(trim.taskId)}" to {formatMinutes(trim.durationMin)}?
                  {task && <span className="font-normal text-text-muted"> (now {formatMinutes(task.durationMin)})</span>}
                </p>
                {trim.reason && <p className="text-[10px] leading-snug text-text-muted">{trim.reason}</p>}
                <button type="button" onClick={() => onTrim(trim.taskId, trim.durationMin)} className={cn(quietButton, 'self-start')}>
                  <Scissors className="h-3 w-3" />
                  Shrink to {formatMinutes(trim.durationMin)}
                </button>
              </>
            )}
          </div>
        )
      })}

      {draft.unplaced.length > 0 && (
        <div data-testid="autofill-unplaced" className="flex flex-col gap-0.5 text-[11px] text-text-secondary">
          <span className="font-medium">Didn't fit this time:</span>
          {draft.unplaced.map((u) => (
            <span key={u.taskId}>
              {u.task.title} ({formatMinutes(u.task.durationMin)}) - {unplacedReason(u.reason, minutesPerDay)}
            </span>
          ))}
        </div>
      )}
      {assumed.length > 0 && (
        <p className="text-[10px] leading-snug text-text-muted">
          Assumed {formatMinutes(ASSUMED_ESTIMATE_MIN)} for {assumed.join(', ')}, which had no estimate. Drag a block's edge to change it.
        </p>
      )}

      {layer.error && <p role="status" className="text-[11px] text-text-secondary">{layer.error}</p>}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <button type="button" onClick={() => void layer.acceptAll()} disabled={layer.saving || open === 0} className={primaryButton}>
          Accept all
        </button>
        <button type="button" onClick={onKeepPlan} disabled={layer.saving} className={quietButton}>
          Keep my plan
        </button>
      </div>
      <p className="text-[10px] text-text-muted">Nothing is saved until you accept. Drag a suggested block to adjust it.</p>
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
      className="group flex cursor-grab flex-col gap-1.5 rounded-lg bg-surface/60 px-2 py-2 ring-1 ring-border-subtle transition-colors hover:ring-accent/30 active:cursor-grabbing"
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-text-muted/60 group-hover:text-text-muted" aria-hidden />
        <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', tone.bar)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium leading-snug text-text-primary" title={todo.title}>{todo.title}</p>
          <p className="text-[10px] text-text-muted">
            {todo.due_at ? `Due ${dayLabel(todo.due_at, now)}` : 'No due date'}
            {task.weakTopic && ' · from a confusing moment'}
          </p>
        </div>
        {todo.duration_min != null && (
          <span className="shrink-0 rounded-md bg-surface-overlay px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-secondary">
            {formatMinutes(todo.duration_min)}
          </span>
        )}
      </div>

      {todo.duration_min == null && (
        <div data-testid="plan-estimate" className="flex flex-wrap items-center gap-1 pl-[18px]">
          <span className="text-[10px] text-text-muted">How long?</span>
          {ESTIMATE_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => onEstimate(min)}
              aria-label={`Estimate ${formatMinutes(min)} for ${todo.title}`}
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/12"
            >
              {formatMinutes(min)}
            </button>
          ))}
        </div>
      )}

      {ghost ? (
        <p className="flex items-center gap-1 pl-[18px] text-[10px] text-accent">
          <Sparkles className="h-2.5 w-2.5" />
          Suggested {dayLabel(ghost, now)} {formatClock(new Date(ghost))}
        </p>
      ) : suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 pl-[18px]">
          <CalendarClock className="h-3 w-3 text-text-muted" aria-hidden />
          {suggestions.map((s) => (
            <button
              key={s.start}
              type="button"
              data-testid="plan-suggestion"
              onClick={() => onPick(new Date(s.start))}
              aria-label={`Schedule ${todo.title} ${slotLabel(s.start, now)}`}
              title={`Add to the calendar ${slotLabel(s.start, now)}`}
              className="rounded-md bg-surface-overlay/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-secondary transition-colors hover:bg-accent/15 hover:text-accent"
            >
              {slotLabel(s.start, now)}
            </button>
          ))}
          <button type="button" onClick={() => setPicking((v) => !v)} className={pickButton}>Other time</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1 pl-[18px]">
          <CalendarClock className="h-3 w-3 text-text-muted" aria-hidden />
          <span className="text-[10px] text-text-muted">No free slot fits as it is.</span>
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

const pickButton = 'rounded-md px-1.5 py-0.5 text-[10px] font-medium text-text-secondary ring-1 ring-border-subtle transition-colors hover:bg-surface-overlay hover:text-text-primary'

const pad2 = (n: number) => String(n).padStart(2, '0')
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Keyboard-friendly way to give a to-do a time without dragging. */
function PickTime({ title, defaultStart, onPick, onCancel }: { title: string; defaultStart: number; onPick: (start: Date) => void; onCancel: () => void }) {
  const [value, setValue] = useState(() => toLocalInput(defaultStart))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const start = new Date(value)
    if (!Number.isNaN(start.getTime())) onPick(start)
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1 pl-[18px]" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <input
        type="datetime-local"
        step={900}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Start time for ${title}`}
        autoFocus
        className="rounded-md bg-surface-overlay px-1.5 py-0.5 text-[10px] text-text-primary ring-1 ring-border-subtle [color-scheme:dark]"
      />
      <button type="submit" className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground hover:bg-accent/90">Add</button>
      <button type="button" onClick={onCancel} className={pickButton}>Cancel</button>
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
    <section data-testid="plan-free-time" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className={sectionLabel}>Study time left</h4>
        <label className="flex items-center gap-1 text-[10px] text-text-muted">
          Up to
          <select
            aria-label="Study time per day"
            value={perDay}
            disabled={!onStudyMinPerDayChange}
            onChange={(e) => onStudyMinPerDayChange?.(Number(e.target.value))}
            className="rounded-md bg-surface-overlay px-1 py-0.5 text-[10px] font-medium text-text-primary ring-1 ring-border-subtle disabled:opacity-60"
          >
            {options.map((min) => <option key={min} value={min}>{formatMinutes(min)}</option>)}
          </select>
          a day
        </label>
      </div>
      <ul className="flex flex-col gap-1">
        {days.map((d) => (
          <li
            key={d.day}
            title={d.past ? undefined : `${formatMinutes(d.leftMin)} of study time left (${formatMinutes(d.freeMin)} free)`}
            className={cn('flex items-center gap-2 text-[10px]', d.past && 'opacity-50')}
          >
            <span className="w-7 shrink-0 font-medium text-text-secondary">{d.label}</span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-overlay/70">
              <span className="absolute inset-y-0 left-0 rounded-full bg-sky-400/55" style={{ width: `${Math.min(1, d.leftMin / perDay) * 100}%` }} />
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
