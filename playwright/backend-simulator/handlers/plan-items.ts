import {
  expandPlanItems,
  matchesPlanItemFilters,
  validatePlanItem,
  newPlanItemInput,
  planItemUpdateInput,
  planItemListInput,
  planItemIdInput,
  planItemOnBoardInput,
  parsePlanItemInput as parse,
} from '@pls/substrate'
import type { PlanItem, PlanItemQuery } from '@pls/substrate'
import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb, StoredPlanItem } from '../in-memory-db'

/**
 * Mirrors apps/server/src/routers/plan-items.ts: the same input schemas (which
 * normalise timestamps to Z and strip unknown keys), validation and recurrence
 * expansion, all from @pls/substrate; course lives in `db.tags`
 * as a 'plan_item' tag, as on the server. Workflow events are not dispatched
 * (the simulator has no workflow engine).
 */
export function registerPlanItemsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  const courseOf = (id: string): string | null => {
    const tags = db.tags
      .filter((t) => t.target_type === 'plan_item' && t.target_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    return tags[0]?.label ?? null
  }

  const setCourse = (id: string, course: string | null) => {
    db.tags = db.tags.filter((t) => !(t.target_type === 'plan_item' && t.target_id === id))
    if (course) {
      db.tags.push({ id: `tag-${crypto.randomUUID().slice(0, 8)}`, target_type: 'plan_item', target_id: id, label: course, created_at: new Date().toISOString() })
    }
  }

  const withCourse = (row: StoredPlanItem): PlanItem => ({ ...row, course: courseOf(row.id) })

  const find = (id: string): StoredPlanItem => {
    const row = db.planItems.find((p) => p.id === id)
    if (!row) throw new Error('Plan item not found')
    return row
  }

  const assertValid = (item: Parameters<typeof validatePlanItem>[0]) => {
    const reason = validatePlanItem(item)
    if (reason) throw new Error(reason)
  }

  router.register('planItems.list', (input) => {
    const query: PlanItemQuery = parse(planItemListInput, input) ?? {}
    const items = db.planItems.map(withCourse).filter((p) => matchesPlanItemFilters(p, query))
    return expandPlanItems(items, query)
  })

  router.register('planItems.byId', (input) => {
    const row = db.planItems.find((p) => p.id === parse(planItemIdInput, input))
    return row ? withCourse(row) : null
  })

  router.register('planItems.create', (input) => {
    const { course, ...fields } = parse(newPlanItemInput, input)
    assertValid(fields)
    const now = new Date().toISOString()
    const row: StoredPlanItem = {
      id: `pi-${crypto.randomUUID().slice(0, 8)}`,
      kind: fields.kind,
      title: fields.title,
      starts_at: fields.starts_at ?? null,
      ends_at: fields.ends_at ?? null,
      due_at: fields.due_at ?? null,
      duration_min: fields.duration_min ?? null,
      status: fields.status ?? 'open',
      recurrence: fields.recurrence ?? null,
      subtype: fields.subtype ?? null,
      source_type: fields.source_type ?? null,
      source_id: fields.source_id ?? null,
      source_offset_ms: fields.source_offset_ms ?? null,
      created_at: now,
      updated_at: now,
    }
    db.planItems.push(row)
    setCourse(row.id, course ?? null)
    return withCourse(row)
  })

  router.register('planItems.update', (input) => {
    const { id, patch } = parse(planItemUpdateInput, input)
    const row = find(id)
    const { course, ...fields } = patch
    const merged = { ...row, ...fields }
    assertValid(merged)
    Object.assign(row, fields, { updated_at: new Date().toISOString() })
    if (course !== undefined) setCourse(id, course)
    return withCourse(row)
  })

  const setStatus = (id: string, status: StoredPlanItem['status']) => {
    const row = find(id)
    if (row.status !== status) Object.assign(row, { status, updated_at: new Date().toISOString() })
    return withCourse(row)
  }

  router.register('planItems.complete', (input) => setStatus(parse(planItemOnBoardInput, input).id, 'done'))
  router.register('planItems.dismiss', (input) => setStatus(parse(planItemOnBoardInput, input).id, 'dismissed'))

  router.register('planItems.delete', (input) => {
    const id = parse(planItemIdInput, input)
    if (!db.remove(db.planItems, id)) throw new Error('Plan item not found')
    setCourse(id, null)
  })
}
