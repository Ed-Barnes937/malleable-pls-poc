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
  bookSessionsInput,
  planItemsRevertInput,
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
  CLOSED_WITH_TODO,
  bookedMinutes,
  isPlainTodo,
  isSession,
  newSession,
  sessionParentId,
  todosToPlan,
  withPendingBookings,
  trustedPendingBookings,
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

  // As the server: a to-do booked in one block becomes sessions when a
  // second booking is needed (its own block moves into a session first).
  const ownBlockToSession = (fields: { kind: PlanItem['kind']; source_type?: string | null; source_id?: string | null }, now: string) => {
    const parentId = sessionParentId({ kind: fields.kind, source_type: fields.source_type ?? null, source_id: fields.source_id ?? null })
    const todo = parentId ? db.planItems.find((p) => p.id === parentId) : undefined
    if (parentId && !todo) throw new SimulatorError('NOT_FOUND', 'Plan item not found')
    if (!todo || !isPlainTodo(todo) || todo.recurrence || !todo.starts_at || !todo.ends_at) return
    const session = newSession(withCourse(todo), todo.starts_at, todo.ends_at)
    db.planItems.push({
      id: `pi-${crypto.randomUUID().slice(0, 8)}`,
      kind: 'task', title: session.title, starts_at: session.starts_at ?? null, ends_at: session.ends_at ?? null,
      due_at: session.due_at ?? null, duration_min: session.duration_min ?? null, status: todo.status,
      recurrence: null, subtype: null, source_type: session.source_type ?? null, source_id: session.source_id ?? null,
      source_offset_ms: null, created_by_workflow_id: null, time_zone: todo.time_zone, created_at: now, updated_at: now,
    })
    setCourse(db.planItems[db.planItems.length - 1].id, session.course ?? null)
    todo.starts_at = null
    todo.ends_at = null
    todo.updated_at = now
  }

  router.register('planItems.create', (input) => {
    const { course, workspaceId: _board, timeZone, ...fields } = parse(newPlanItemOnBoardInput, input)
    assertValid(fields)
    const now = new Date().toISOString()
    ownBlockToSession(fields, now)
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
    raiseEstimateToBooked(row)
    return withCourse(row)
  })

  // As the server's `planItems.bookSessions`: all the sessions, or none.
  router.register('planItems.bookSessions', (input) => {
    // An invalid block (empty, longer than a day, overlapping) is BAD_REQUEST, as tRPC's input check on the server.
    const checked = bookSessionsInput.safeParse(input)
    if (!checked.success) throw new SimulatorError('BAD_REQUEST', checked.error.issues.map((i) => i.message).join('; '))
    const { todoId, blocks, timeZone } = checked.data
    const todo = db.planItems.find((p) => p.id === todoId)
    if (!todo) throw new SimulatorError('NOT_FOUND', 'Plan item not found')
    if (!isPlainTodo(todo) || todo.status !== 'open') throw new SimulatorError('BAD_REQUEST', 'Only an open to-do of your own can be booked in sessions')
    const sessions = blocks.map((b) => newSession(withCourse(todo), b.starts_at, b.ends_at))
    for (const s of sessions) assertValid(s)
    const now = new Date().toISOString()
    const made = sessions.map((s) => {
      ownBlockToSession(s, now)
      const row: StoredPlanItem = {
        id: `pi-${crypto.randomUUID().slice(0, 8)}`, kind: 'task', title: s.title, starts_at: s.starts_at ?? null, ends_at: s.ends_at ?? null,
        due_at: s.due_at ?? null, duration_min: s.duration_min ?? null, status: 'open', recurrence: null, subtype: null,
        source_type: s.source_type ?? null, source_id: s.source_id ?? null, source_offset_ms: null, created_by_workflow_id: null,
        time_zone: studentTimeZone(timeZone), created_at: now, updated_at: now,
      }
      db.planItems.push(row)
      setCourse(row.id, s.course ?? null)
      return row
    })
    raiseEstimateToBooked(made[0])
    return made.map(withCourse)
  })

  router.register('planItems.update', (input) => {
    const { id, patch, timeZone } = parse(planItemUpdateOnBoardInput, input)
    const row = find(id)
    const { course, ...fields } = patch
    const merged = { ...row, ...fields }
    assertValid(merged)
    const before = { ...row }
    Object.assign(row, fields, { time_zone: row.time_zone ?? studentTimeZone(timeZone), updated_at: new Date().toISOString() })
    if (course !== undefined) setCourse(id, course)
    cascadeToSessions(before, row, course)
    if (row.starts_at !== before.starts_at || row.ends_at !== before.ends_at) raiseEstimateToBooked(row)
    return withCourse(row)
  })

  /** As the server: a booking lengthened past its to-do's estimate raises the estimate to the booked total, never lowers it. */
  const raiseEstimateToBooked = (item: StoredPlanItem) => {
    if (item.kind !== 'task') return
    const parentId = sessionParentId(item)
    const todo = parentId ? db.planItems.find((p) => p.id === parentId) : item
    if (!todo || todo.duration_min == null || todo.recurrence) return
    const rows = parentId ? db.planItems.filter((p) => sessionParentId(p) === todo.id && p.status !== 'dismissed') : []
    const booked = Math.round(bookedMinutes([todo, ...rows]).get(todo.id) ?? 0)
    if (booked > todo.duration_min) {
      todo.duration_min = booked
      todo.updated_at = new Date().toISOString()
    }
  }

  const sessionsOf = (todoId: string) => db.planItems.filter((p) => sessionParentId(p) === todoId)

  /** As the server's `cascadeToSessions`: a to-do's sessions follow its status, title, course and due time. */
  const cascadeToSessions = (before: StoredPlanItem, after: StoredPlanItem, course?: string | null) => {
    if (after.kind !== 'task') return
    if (isSession(after)) {
      if (before.status !== after.status && after.subtype === CLOSED_WITH_TODO) after.subtype = null
      return
    }
    const at = new Date().toISOString()
    for (const s of sessionsOf(after.id)) {
      if (before.title !== after.title) Object.assign(s, { title: after.title, updated_at: at })
      if (before.due_at !== after.due_at) Object.assign(s, { due_at: after.due_at, updated_at: at })
      if (course !== undefined) setCourse(s.id, course)
      if (before.status === after.status) continue
      if (after.status === 'open' && s.subtype === CLOSED_WITH_TODO) {
        Object.assign(s, { status: Date.parse(s.ends_at!) > clock() ? 'open' : s.status, subtype: null, updated_at: at })
      } else if (after.status !== 'open' && s.status === 'open') {
        Object.assign(s, { status: after.status, subtype: CLOSED_WITH_TODO, updated_at: at })
      }
    }
  }

  const setStatus = (id: string, status: StoredPlanItem['status']) => {
    const row = find(id)
    const before = { ...row }
    if (row.status !== status) Object.assign(row, { status, updated_at: new Date().toISOString() })
    cascadeToSessions(before, row)
    return withCourse(row)
  }

  router.register('planItems.complete', (input) => setStatus(parse(planItemOnBoardInput, input).id, 'done'))
  router.register('planItems.dismiss', (input) => setStatus(parse(planItemOnBoardInput, input).id, 'dismissed'))

  router.register('planItems.undismiss', (input) => {
    const { id } = parse(planItemOnBoardInput, input)
    const row = find(id)
    if (row.status !== 'dismissed') return withCourse(row)
    const at = new Date().toISOString()
    Object.assign(row, { status: 'open', updated_at: at })
    if (row.kind === 'task' && !isSession(row)) {
      for (const s of sessionsOf(id)) if (s.subtype === CLOSED_WITH_TODO) Object.assign(s, { status: 'open', subtype: null, updated_at: at })
    }
    return withCourse(row)
  })

  router.register('planItems.revert', (input) => {
    const { items } = parse(planItemsRevertInput, input)
    // All or none, as the server's transaction.
    const rows = items.map((it) => {
      const row = find(it.id)
      assertValid({ ...row, starts_at: it.starts_at, ends_at: it.ends_at, duration_min: it.duration_min })
      return row
    })
    return items.map((it, i) => {
      if (it.sessions) {
        for (const s of sessionsOf(it.id)) {
          if (s.status === 'dismissed' || it.sessions.includes(s.id)) continue
          db.remove(db.planItems, s.id)
          setCourse(s.id, null)
        }
      }
      Object.assign(rows[i], { starts_at: it.starts_at, ends_at: it.ends_at, duration_min: it.duration_min, updated_at: new Date().toISOString() })
      return withCourse(rows[i])
    })
  })

  /** As the server's plan_item_trash: what delete took, so restore can put it back. */
  const trash = new Map<string, { row: StoredPlanItem; parentId: string | null; course: string | null; lectureIds: string[] }>()
  const toTrash = (row: StoredPlanItem, parentId: string | null) => {
    const lectureIds = db.lectures.filter((l) => l.class_item_id === row.id).map((l) => l.id)
    trash.set(row.id, { row: { ...row }, parentId, course: courseOf(row.id), lectureIds })
    db.remove(db.planItems, row.id)
    setCourse(row.id, null)
    // As the server's ON DELETE SET NULL: its lectures keep their date.
    for (const lecture of db.lectures) if (lecture.class_item_id === row.id) lecture.class_item_id = null
  }

  router.register('planItems.delete', (input) => {
    const id = parse(planItemIdInput, input)
    const row = db.planItems.find((p) => p.id === id)
    if (!row) throw new SimulatorError('NOT_FOUND', 'Plan item not found')
    const sessions = sessionsOf(id)
    toTrash(row, null)
    for (const s of sessions) toTrash(s, id)
  })

  router.register('planItems.restore', (input) => {
    const id = parse(planItemIdInput, input)
    if (!trash.has(id)) throw new SimulatorError('NOT_FOUND', 'Nothing to restore')
    for (const [key, t] of [...trash]) {
      if (key !== id && t.parentId !== id) continue
      db.planItems.push({ ...t.row })
      setCourse(key, t.course)
      for (const lecture of db.lectures) if (t.lectureIds.includes(lecture.id) && lecture.class_item_id == null) lecture.class_item_id = key
      trash.delete(key)
    }
    return withCourse(find(id))
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
    const open = all.filter((p) => p.kind === 'task' && p.status === 'open' && !isSession(p))
    const pending = trustedPendingBookings(q.pending, { week, todoIds: new Set(open.map((t) => t.id)) })
    const rows = withPendingBookings(expandPlanItems(all.filter((p) => matchesPlanItemFilters(p, { statuses: ['open', 'done'] })), { from: q.from, to: q.to }), pending)
    const todos = todosToPlan(open, bookedMinutes(withPendingBookings(all, pending)))
    const tasks = planTasks(todos, week, { now, estimates: q.estimates })
    if (tasks.length === 0) return { order: [], trims: [], note: null }
    const placement = placementOpts(q.timeZone)
    const cap = planCapacity(weekLayout(rows, week, placement), tasks, now)
    const raw = planAutofillTask.fake({ tasks, freeMin: cap.freeMin, neededMin: cap.neededMin, minutesPerDay: placement.studyMinPerDay, weakTopics: [], timeZone: placement.timeZone })
    return sanitizeAdvice(raw, tasks, cap)
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
