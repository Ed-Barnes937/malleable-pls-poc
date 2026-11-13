import type { PlanItem } from '@pls/substrate'
import type { BackendSimulator } from './backend-simulator'

/**
 * Seeds one plan item into the CT simulator, with its course on the row as on
 * the server. Times are whatever the test passes:
 * build them relative to `Date.now()` so widgets that read the real clock
 * (look-ahead, "still to do") see them where intended.
 */
export function seedPlanItem(
  simulator: BackendSimulator,
  fields: Partial<PlanItem> & Pick<PlanItem, 'id' | 'kind' | 'title'>,
): PlanItem {
  const now = new Date().toISOString()
  const stored: PlanItem = {
    starts_at: null, ends_at: null, due_at: null, duration_min: null, status: 'open',
    recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null,
    created_by_workflow_id: null,
    created_at: now, updated_at: now,
    ...fields,
    course: fields.course ?? null,
  }
  simulator.db.planItems.push(stored)
  return { ...stored }
}

/** ISO time `days` from now (or from `from`; negative for the past), at `hour`:00 local time. */
export function daysFromNow(days: number, hour = 12, from: Date = new Date()): string {
  // Calendar arithmetic (not 24h steps) so a DST change can't shift the day.
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
