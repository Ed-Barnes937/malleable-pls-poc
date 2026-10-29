import {
  draftPlan,
  formatMinutes,
  planTasks,
  type PlanAdvice,
  type PlanItem,
  type PlanTask,
  type Unplaced,
  type WeekLayout,
} from '@pls/substrate'
import type { Proposal } from './proposals'

type Todo = Pick<PlanItem, 'id' | 'title' | 'course' | 'due_at' | 'duration_min' | 'subtype'>

export interface AutofillDraft {
  proposals: Proposal[]
  /** In priority order, with the task, so the panel can say what didn't fit. */
  unplaced: (Unplaced & { task: PlanTask })[]
  tasks: PlanTask[]
}

/**
 * Turns Auto-fill advice into ghost blocks: the to-dos in the advised
 * order, with any trims the student applied, placed by the scheduler around
 * everything busy. `pinned` are ghosts the student already dragged: they stay
 * where they are and their to-dos are not placed again. Pure and
 * deterministic: the same inputs always give the same draft.
 */
export function buildAutofillDraft(args: {
  todos: ReadonlyArray<Todo>
  layout: WeekLayout
  now: number
  advice: Pick<PlanAdvice, 'order'>
  /** Task id -> trimmed length the student accepted. */
  trims?: ReadonlyMap<string, number>
  /** Assumed lengths for to-dos with no estimate. */
  estimates?: Readonly<Record<string, number>>
  pinned?: ReadonlyArray<Proposal>
}): AutofillDraft {
  const { layout, now, advice } = args
  const trims = args.trims ?? new Map<string, number>()
  const tasks = planTasks(args.todos, layout.week, { now, estimates: args.estimates }).map((t) => {
    const trimmed = trims.get(t.id)
    return trimmed ? { ...t, durationMin: trimmed } : t
  })
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const pinned = (args.pinned ?? []).filter((p) => byId.has(p.taskId))
  const pinnedIds = new Set(pinned.map((p) => p.taskId))
  const rank = new Map(advice.order.map((id, i) => [id, i]))
  const ordered = tasks
    .filter((t) => !pinnedIds.has(t.id))
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))

  const result = draftPlan(ordered, layout, {
    now,
    pinned: pinned.map((p) => ({ taskId: p.taskId, start: Date.parse(p.startsAt), end: Date.parse(p.endsAt) })),
  })

  const original = new Map(args.todos.map((t) => [t.id, t.duration_min]))
  const placed: Proposal[] = result.placements.map((p) => {
    const task = byId.get(p.taskId)!
    const before = original.get(task.id)
    return {
      id: task.id,
      taskId: task.id,
      title: task.title,
      course: task.course,
      startsAt: new Date(p.start).toISOString(),
      endsAt: new Date(p.end).toISOString(),
      note: trims.has(task.id) && before ? `Shrunk from ${formatMinutes(before)}` : undefined,
    }
  })
  return {
    proposals: [...pinned, ...placed].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    unplaced: result.unplaced.map((u) => ({ ...u, task: byId.get(u.taskId)! })),
    tasks,
  }
}

/**
 * Where Help me plan's Auto-fill is. Owned by the Calendar (next to the
 * proposal layer), so closing and reopening the panel keeps the draft's
 * note, trims and "didn't fit" list.
 */
export type AutofillState =
  | { state: 'idle' }
  | { state: 'confirm-estimates' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | {
      state: 'drafted'
      /** The week the draft is for (layout.week.start). */
      week: number
      /** The study time per day it was drafted with. */
      minutesPerDay: number
      advice: PlanAdvice
      estimates: Record<string, number>
      /** Trims the student applied: task id -> length. */
      trims: Map<string, number>
      draft: AutofillDraft
    }

/** Planned minutes of a set of proposals. */
export function proposalMinutes(proposals: ReadonlyArray<Proposal>): number {
  return proposals.reduce((sum, p) => sum + (Date.parse(p.endsAt) - Date.parse(p.startsAt)) / 60_000, 0)
}

/**
 * Calm words for why a to-do didn't fit. For one that found no slot, `cause`
 * (see `noSlotCause`) says whether the days' study time or their gaps were
 * too short, agreeing with the draft's leftover sentence.
 */
export function unplacedReason(reason: Unplaced['reason'], minutesPerDay: number, cause?: 'budget' | 'gaps'): string {
  switch (reason) {
    case 'over-daily-budget':
      return `longer than your ${formatMinutes(minutesPerDay)} a day`
    case 'window-closed':
      return 'not enough time before it is due'
    case 'invalid-duration':
      return 'it needs an estimate'
    default:
      return cause === 'budget' ? 'too little study time left on any day' : 'no free gap long enough'
  }
}
