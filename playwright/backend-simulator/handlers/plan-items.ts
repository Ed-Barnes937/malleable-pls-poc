import {
  expandPlanItems,
  matchesPlanItemFilters,
  validatePlanItem,
  newPlanItemOnBoardInput,
  planItemUpdateOnBoardInput,
  DEFAULT_REVIEW_TIME_ZONE,
  planItemListInput,
  planItemIdInput,
  planItemOnBoardInput,
  parsePlanItemInput as parse,
  planAutofillInput,
  planCapacity,
  planTasks,
  sanitizeAdvice,
  weekLayout,
  busyTime,
  isMissedBlock,
  planRefit,
  refitAcceptInput,
  refitConflict,
  refitPreviewInput,
  refitRange,
  withDefaults,
} from '@pls/substrate'
// The server's own mock-mode reply, so CT sees exactly what mock e2e sees.
import { planAutofillTask } from '../../../apps/server/src/ai/tasks/plan-autofill'
import type { PlanItem, PlanItemQuery } from '@pls/substrate'
import { SimulatorError, type ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb, StoredPlanItem } from '../in-memory-db'

/**
 * Mirrors apps/server/src/routers/plan-items.ts: the same input schemas (which
 * normalise timestamps to Z and strip unknown keys), validation and recurrence
 * expansion, all from @pls/substrate; course lives in `db.tags`
 * as a 'plan_item' tag, as on the server. Workflow events are not dispatched
 * (the simulator has no workflow engine).
 */
export function registerPlanItemsHandlers(router: ProcedureRouter, db: InMemoryDb, clock: () => number = Date.now): void {
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
  // As the server keeps it on a new item: the preference, else the browser's.
  const studentTimeZone = (browserZone: string | undefined) =>
    withDefaults(db.preferences).time_zone ?? browserZone ?? DEFAULT_REVIEW_TIME_ZONE

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
    const { course, workspaceId: _board, timeZone, ...fields } = parse(newPlanItemOnBoardInput, input)
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
      // Only automations credit themselves, server side; never from a client.
      created_by_workflow_id: null,
      time_zone: studentTimeZone(timeZone),
      created_at: now,
      updated_at: now,
    }
    db.planItems.push(row)
    setCourse(row.id, course ?? null)
    return withCourse(row)
  })

  router.register('planItems.update', (input) => {
    const { id, patch, timeZone } = parse(planItemUpdateOnBoardInput, input)
    const row = find(id)
    const { course, ...fields } = patch
    const merged = { ...row, ...fields }
    assertValid(merged)
    Object.assign(row, fields, { time_zone: row.time_zone ?? studentTimeZone(timeZone), updated_at: new Date().toISOString() })
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
    // As the server's ON DELETE SET NULL: its lectures keep their date.
    for (const lecture of db.lectures) if (lecture.class_item_id === id) lecture.class_item_id = null
  })

  /** The student's study hours and budget, and their zone if set (else the caller's), as the server reads them. */
  const placementOpts = (fallbackZone: string) => {
    const prefs = withDefaults(db.preferences)
    return { timeZone: prefs.time_zone ?? fallbackZone, studyHours: prefs.study_hours, studyMinPerDay: prefs.study_min_per_day }
  }

  // Mirrors apps/server/src/routers/planning.ts with the mock LLM. The
  // simulator keeps no confidence-derived weak topics: reviews still count.
  router.register('planning.autofill', (input) => {
    const q = parse(planAutofillInput, input)
    const now = clock()
    const week = { start: Date.parse(q.from), end: Date.parse(q.to) }
    const all = db.planItems.map(withCourse)
    const rows = expandPlanItems(all.filter((p) => matchesPlanItemFilters(p, { statuses: ['open', 'done'] })), { from: q.from, to: q.to })
    const todos = all.filter((p) => p.kind === 'task' && p.status === 'open' && p.starts_at == null)
    const tasks = planTasks(todos, week, { now, estimates: q.estimates })
    if (tasks.length === 0) return { order: [], trims: [], note: null }
    const placement = placementOpts(q.timeZone)
    const cap = planCapacity(weekLayout(rows, week, placement), tasks, now)
    const raw = planAutofillTask.fake({ tasks, freeMin: cap.freeMin, neededMin: cap.neededMin, minutesPerDay: placement.studyMinPerDay, weakTopics: [], timeZone: placement.timeZone })
    return sanitizeAdvice(raw, tasks, cap, placement.studyMinPerDay)
  })

  // Re-fit, as apps/server/src/planning/refit.ts: same rules (@pls/substrate
  // planning), in-memory data.
  const missedNow = (now: number) => db.planItems.map(withCourse).filter((p) => isMissedBlock(p, now))
  const rangeItems = (missed: PlanItem[], opts: { now: number; timeZone: string }) => {
    const range = refitRange(missed, opts)
    const query: PlanItemQuery = { from: new Date(range.start).toISOString(), to: new Date(range.end).toISOString(), statuses: ['open', 'done'] }
    return expandPlanItems(db.planItems.map(withCourse).filter((p) => matchesPlanItemFilters(p, query)), query)
  }

  router.register('planItems.refitPreview', (input) => {
    const { timeZone } = parse(refitPreviewInput, input)
    const opts = { now: clock(), ...placementOpts(timeZone) }
    const missed = missedNow(opts.now)
    return missed.length ? planRefit(missed, rangeItems(missed, opts), opts) : []
  })

  router.register('planItems.refit', (input) => {
    const { timeZone, blocks } = parse(refitAcceptInput, input)
    const now = clock()
    const missed = new Map(missedNow(now).map((p) => [p.id, p]))
    const accepted = blocks.map((b) => {
      if (!missed.has(b.id)) throw new SimulatorError('CONFLICT', 'A block was already moved, done or removed.')
      return { id: b.id, start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) }
    })
    const { commitments, busy } = busyTime(rangeItems([...missed.values()], { now, timeZone }), new Set(accepted.map((a) => a.id)))
    const taken = [...commitments, ...busy]
    for (const a of accepted) {
      if (refitConflict(a, taken, now)) throw new SimulatorError('CONFLICT', 'Your week changed since this re-fit was suggested.')
      taken.push(a)
    }
    for (const a of accepted) {
      const row = find(a.id)
      row.starts_at = new Date(a.start).toISOString()
      row.ends_at = new Date(a.end).toISOString()
      row.updated_at = new Date().toISOString()
    }
    return { moved: accepted.length }
  })
}
