import type { NewPlanItem, PlanItemKind, PlanItemOccurrence, PlanItemPatch } from '@pls/substrate'

/**
 * What the create / edit popover holds. Maps to a plan item:
 * - `commitment` ("Class or commitment"): a fixed block, can repeat weekly;
 * - `task` ("Study time"): a movable block, `duration_min` = its length;
 * - `deadline` ("Due"): `start` is the due time, `end` unused.
 */
export interface Draft {
  kind: PlanItemKind
  title: string
  start: Date
  end: Date
  course: string | null
  repeatsWeekly: boolean
}

export const KIND_LABELS: Record<PlanItemKind, string> = {
  commitment: 'Class or commitment',
  task: 'Study time',
  deadline: 'Due',
}

const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000)

export function validateDraft(d: Draft): string | null {
  if (!d.title.trim()) return 'Give it a name'
  if (d.kind !== 'deadline' && d.end.getTime() <= d.start.getTime()) return 'End after it starts'
  return null
}

export function newItemFromDraft(d: Draft, timeZone: string): NewPlanItem {
  const base = { kind: d.kind, title: d.title.trim(), course: d.course }
  if (d.kind === 'deadline') return { ...base, due_at: d.start.toISOString() }
  const times = { starts_at: d.start.toISOString(), ends_at: d.end.toISOString() }
  if (d.kind === 'task') return { ...base, ...times, duration_min: minutesBetween(d.start, d.end) }
  return { ...base, ...times, recurrence: d.repeatsWeekly ? { freq: 'weekly', timeZone } : null }
}

export function draftFromRow(row: PlanItemOccurrence): Draft {
  const start = new Date((row.kind === 'deadline' ? row.due_at : row.starts_at) ?? row.due_at ?? row.created_at)
  const end = row.ends_at ? new Date(row.ends_at) : new Date(start.getTime() + 60 * 60_000)
  return {
    kind: row.kind,
    title: row.title,
    start,
    end,
    course: row.course,
    repeatsWeekly: row.recurrence != null,
  }
}

const shift = (series: string | null, from: string | null, to: Date) =>
  new Date(Date.parse(series ?? from!) + (to.getTime() - Date.parse(from!))).toISOString()

/**
 * Patch that moves / resizes a row to `start`-`end`. Updates apply to the
 * whole series, so the stored series times shift by the same delta as this
 * occurrence (see PlanItemOccurrence). A study block keeps `duration_min` in
 * step with its length.
 */
export function movePatch(row: PlanItemOccurrence, start: Date, end: Date): PlanItemPatch {
  const patch: PlanItemPatch = {}
  if (start.getTime() !== Date.parse(row.starts_at!)) patch.starts_at = shift(row.series_starts_at, row.starts_at, start)
  if (end.getTime() !== Date.parse(row.ends_at!)) patch.ends_at = shift(row.series_ends_at, row.ends_at, end)
  // validatePlanItem needs both ends together.
  if (patch.starts_at && !patch.ends_at) patch.ends_at = row.series_ends_at ?? row.ends_at
  if (patch.ends_at && !patch.starts_at) patch.starts_at = row.series_starts_at ?? row.starts_at
  const length = minutesBetween(start, end)
  if (row.kind === 'task' && row.duration_min !== length) patch.duration_min = length
  return patch
}

/** Only the fields the popover changed (never the row echoed back). */
export function patchFromDraft(row: PlanItemOccurrence, d: Draft, timeZone: string): PlanItemPatch {
  const patch: PlanItemPatch = {}
  const title = d.title.trim()
  if (title !== row.title) patch.title = title
  if (d.course !== row.course) patch.course = d.course

  if (row.kind === 'deadline') {
    if (d.start.getTime() !== Date.parse(row.due_at!)) patch.due_at = shift(row.series_due_at, row.due_at, d.start)
    return patch
  }

  if (row.recurrence && !d.repeatsWeekly) {
    // Stop repeating: keep just this occurrence, at its (possibly edited) time.
    return { ...patch, recurrence: null, starts_at: d.start.toISOString(), ends_at: d.end.toISOString() }
  }
  Object.assign(patch, movePatch(row, d.start, d.end))
  if (!row.recurrence && d.repeatsWeekly && row.kind === 'commitment') patch.recurrence = { freq: 'weekly', timeZone }
  return patch
}
