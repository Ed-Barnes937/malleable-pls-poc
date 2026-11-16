import {
  courseIdInput,
  courseInUseMessage,
  courseNameKey,
  courseUpdateInput,
  duplicateCourseMessage,
  newCourseInput,
  nextCourseColor,
  sortCourses,
  type Course,
} from '@pls/substrate'
import { ProcedureRouter, SimulatorError, parse } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

/**
 * As the server's `requireOwnCourse`: BAD_REQUEST "Unknown course" unless
 * `course` is one of the student's (archived ones included). Null or
 * undefined (no course) passes.
 */
export function requireCourse(db: InMemoryDb, course: string | null | undefined): void {
  if (course != null && !db.courses.some((c) => c.id === course)) throw new SimulatorError('BAD_REQUEST', 'Unknown course')
}

/** A course's name, for what the server names after it (a lecture's default title). */
export function courseName(db: InMemoryDb, course: string | null): string | null {
  return course ? db.courses.find((c) => c.id === course)?.name ?? null : null
}

function sameName(db: InMemoryDb, name: string, exceptId: string | null): Course | undefined {
  return db.courses.find((c) => c.id !== exceptId && courseNameKey(c.name) === courseNameKey(name))
}

/** Mirrors `routers/courses.ts` on the server: the same procedures, rules and errors. */
export function registerCoursesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('courses.list', () => sortCourses(db.courses).map((c) => ({ ...c })))

  router.register('courses.create', (input) => {
    const { name, color } = parse(newCourseInput, input)
    const existing = sameName(db, name, null)
    if (existing) throw new SimulatorError('CONFLICT', duplicateCourseMessage(existing))
    const course: Course = { id: crypto.randomUUID(), name, color: color ?? nextCourseColor(db.courses), archived_at: null }
    db.courses.push(course)
    return { ...course }
  })

  router.register('courses.update', (input) => {
    const { id, name, color, archived } = parse(courseUpdateInput, input)
    const course = db.courses.find((c) => c.id === id)
    if (!course) throw new SimulatorError('NOT_FOUND', 'Course not found')
    if (name !== undefined) {
      const existing = sameName(db, name, id)
      if (existing) throw new SimulatorError('CONFLICT', duplicateCourseMessage(existing))
      course.name = name
    }
    if (color !== undefined) course.color = color
    if (archived !== undefined) course.archived_at = archived ? (course.archived_at ?? new Date().toISOString()) : null
    return { ...course }
  })

  router.register('courses.delete', (input) => {
    const id = parse(courseIdInput, input)
    const course = db.courses.find((c) => c.id === id)
    if (!course) throw new SimulatorError('NOT_FOUND', 'Course not found')
    const usage = {
      lectures: db.lectures.filter((l) => l.course === id).length,
      resources: db.resources.filter((r) => r.course === id).length,
      planItems: db.planItems.filter((p) => p.course === id).length,
    }
    if (usage.lectures + usage.resources + usage.planItems > 0) {
      throw new SimulatorError('CONFLICT', courseInUseMessage(course.name, usage))
    }
    // Boards on it show every course again, as on the server.
    db.workspaceScopes = db.workspaceScopes.filter((s) => !(s.scope_type === 'tag' && s.scope_value === id))
    db.remove(db.courses, id)
    return { id }
  })
}
