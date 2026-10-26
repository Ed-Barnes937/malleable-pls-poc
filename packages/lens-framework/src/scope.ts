import type { DateRange, Scope, ScopeDeclaration, ScopeDim } from './types'
import type { PanelManifest } from './substrate-contract'

const SCOPE_DIMS: ScopeDim[] = ['courseTag', 'recordingId']

/** True when the widget responds to `dim` at all (any mode but `ignore`). */
export function usesScopeDim(declaration: ScopeDeclaration | undefined, dim: ScopeDim): boolean {
  const mode = declaration?.[dim]
  return mode !== undefined && mode !== 'ignore'
}

/**
 * The board scope a widget is allowed to see: dimensions it ignores are
 * dropped, so `ignore` is enforced by the shell rather than by convention.
 */
export function narrowScope(scope: Scope, declaration: ScopeDeclaration | undefined): Scope {
  const narrowed: Scope = {}
  for (const dim of SCOPE_DIMS) {
    if (usesScopeDim(declaration, dim) && scope[dim] !== undefined) narrowed[dim] = scope[dim]
  }
  return narrowed
}

/**
 * Union of the dimensions used by any of `manifests`. Drives which scope
 * pickers the board offers and which parts of the scope chip are shown.
 */
export function activeScopeDims(manifests: Pick<PanelManifest, 'scope'>[]): Set<ScopeDim> {
  const dims = new Set<ScopeDim>()
  for (const m of manifests) {
    for (const dim of SCOPE_DIMS) if (usesScopeDim(m.scope, dim)) dims.add(dim)
  }
  return dims
}

/** Writer access is granted to widgets that declare what they write. */
export function canWrite(manifest: Pick<PanelManifest, 'writes'> | undefined): boolean {
  return (manifest?.writes?.length ?? 0) > 0
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addLocalDays(d: Date, days: number): Date {
  // Calendar arithmetic (not +N*24h) so ranges stay day-aligned across DST.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** Monday 00:00 to the following Monday 00:00 (local time) of the week containing `now`. */
export function weekRange(now: Date): DateRange {
  const today = startOfLocalDay(now)
  const daysSinceMonday = (today.getDay() + 6) % 7
  const monday = addLocalDays(today, -daysSinceMonday)
  return { from: monday.toISOString(), to: addLocalDays(monday, 7).toISOString() }
}

/** `days` whole local days starting today, e.g. 14 for a two-week look-ahead. */
export function lookAheadRange(now: Date, days: number): DateRange {
  const today = startOfLocalDay(now)
  return { from: today.toISOString(), to: addLocalDays(today, days).toISOString() }
}

/** Whether an instant falls inside a range (inclusive start, exclusive end). */
export function inDateRange(instant: string | Date, range: DateRange): boolean {
  const t = new Date(instant).getTime()
  return t >= new Date(range.from).getTime() && t < new Date(range.to).getTime()
}
