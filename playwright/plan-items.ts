import type { PlanItem } from '@pls/substrate'
import type { BackendSimulator } from './backend-simulator'

/**
 * Seeds one plan item into the CT simulator, with its course stored as a
 * 'plan_item' tag as on the server. Times are whatever the test passes:
 * build them relative to `Date.now()` so widgets that read the real clock
 * (look-ahead, "still to do") see them where intended.
 */
export function seedPlanItem(
  simulator: BackendSimulator,
  fields: Partial<PlanItem> & Pick<PlanItem, 'id' | 'kind' | 'title'>,
): PlanItem {
  const now = new Date().toISOString()
  const { course = null, ...rest } = fields
  const stored = {
    starts_at: null, ends_at: null, due_at: null, duration_min: null, status: 'open' as const,
    recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null,
    created_by_workflow_id: null,
    created_at: now, updated_at: now,
    ...rest,
  }
  simulator.db.planItems.push(stored)
  if (course) {
    simulator.db.tags.push({ id: `tag-${fields.id}`, target_type: 'plan_item', target_id: fields.id, label: course, created_at: now })
  }
  return { ...stored, course }
}

/** ISO time `days` from now (or from `from`; negative for the past), at `hour`:00 local time. */
export function daysFromNow(days: number, hour = 12, from: Date = new Date()): string {
  // Calendar arithmetic (not 24h steps) so a DST change can't shift the day.
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
