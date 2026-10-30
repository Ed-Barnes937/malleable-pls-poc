import { defaultLectureTitle, type BoardScope, type Lecture } from '@pls/substrate'
import { SimulatorError, type ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb, StoredLecture } from '../in-memory-db'
import { recordingProcessing } from './course-scope'
import { requireBoard } from './workspaces'

/** Mirrors `COURSE_LABELS` on the server. */
const COURSE_LABELS = new Set(['biology', 'chemistry', 'physics'])

function requireCourse(course: string | null | undefined): void {
  if (course != null && !COURSE_LABELS.has(course)) throw new SimulatorError('BAD_REQUEST', 'Unknown course')
}

/** A stored lecture as `lectures.byId` returns it: with its recordings, oldest first. */
export function lectureRow(db: InMemoryDb, lecture: StoredLecture): Lecture {
  const recordings = db.recordings
    .filter((r) => r.lecture_id === lecture.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((r) => ({
      id: r.id, title: r.title, status: r.status, duration: r.duration, created_at: r.created_at,
      processing: recordingProcessing(db, r.id),
    }))
  return { ...lecture, recordings }
}

/** Mirrors the server's `requireOwnLecture`: a lecture that isn't there is NOT_FOUND. */
export function requireLecture(db: InMemoryDb, lectureId: string): StoredLecture {
  const lecture = db.lectures.find((l) => l.id === lectureId)
  if (!lecture) throw new SimulatorError('NOT_FOUND', 'Lecture not found')
  return lecture
}

function readBoardScope(db: InMemoryDb, workspaceId: string): BoardScope {
  const value = (type: string) => db.workspaceScopes.find((s) => s.workspace_id === workspaceId && s.scope_type === type)?.scope_value ?? null
  return { courseTag: value('tag'), lectureId: value('lecture') }
}

function replaceScopeRow(db: InMemoryDb, workspaceId: string, scopeType: string, value: string | null): void {
  db.workspaceScopes = db.workspaceScopes.filter((s) => !(s.workspace_id === workspaceId && s.scope_type === scopeType))
  if (value !== null) {
    db.workspaceScopes.push({ id: `ws-scope-${crypto.randomUUID().slice(0, 8)}`, workspace_id: workspaceId, scope_type: scopeType, scope_value: value })
  }
}

/**
 * Twin of the server's `writeBoardScope`: a selected lecture brings its
 * course (I1; naming another course with it is BAD_REQUEST), and a course
 * change clears a lecture outside it (I2).
 */
export function writeBoardScope(
  db: InMemoryDb,
  workspaceId: string,
  patch: { courseTag?: string | null; lectureId?: string | null },
): BoardScope {
  requireBoard(db, workspaceId)
  const current = readBoardScope(db, workspaceId)
  let courseTag = patch.courseTag === undefined ? current.courseTag : patch.courseTag
  let lectureId = patch.lectureId === undefined ? current.lectureId : patch.lectureId
  if (patch.lectureId) {
    const lecture = requireLecture(db, patch.lectureId)
    if (patch.courseTag !== undefined && patch.courseTag !== lecture.course) {
      throw new SimulatorError('BAD_REQUEST', "A selected lecture's course is the board course")
    }
    courseTag = lecture.course
  } else if (lectureId) {
    const lecture = db.lectures.find((l) => l.id === lectureId)
    if (!lecture || lecture.course !== courseTag) lectureId = null
  }
  replaceScopeRow(db, workspaceId, 'tag', courseTag)
  replaceScopeRow(db, workspaceId, 'lecture', lectureId)
  return { courseTag, lectureId }
}

export function registerLecturesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('lectures.list', (input) => {
    const { courseTag } = (input ?? {}) as { courseTag?: string }
    return db.lectures
      .filter((l) => !courseTag || l.course === courseTag)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
      .map((l) => lectureRow(db, l))
  })

  router.register('lectures.byId', (input) => {
    const lecture = db.lectures.find((l) => l.id === (input as string))
    return lecture ? lectureRow(db, lecture) : null
  })

  router.register('lectures.create', (input) => {
    const { course, title, startsAt, timeZone, workspaceId } = input as {
      course: string | null; title?: string; startsAt?: string; timeZone?: string; workspaceId?: string
    }
    requireCourse(course)
    if (workspaceId) requireBoard(db, workspaceId)
    const now = new Date().toISOString()
    const starts = startsAt ? new Date(startsAt) : new Date()
    const lecture: StoredLecture = {
      id: `lec-${crypto.randomUUID().slice(0, 8)}`,
      title: title?.trim() || defaultLectureTitle(course, starts, timeZone ?? 'Europe/London'),
      course,
      starts_at: starts.toISOString(),
      class_item_id: null,
      class_date: null,
      created_at: now,
      updated_at: now,
    }
    db.lectures.push(lecture)
    if (workspaceId) writeBoardScope(db, workspaceId, { lectureId: lecture.id })
    return lectureRow(db, lecture)
  })

  router.register('lectures.update', (input) => {
    const { id, title, course } = input as { id: string; title?: string; course?: string | null }
    const lecture = requireLecture(db, id)
    if (course !== undefined) requireCourse(course)
    const before = lecture.course
    if (title) lecture.title = title.trim()
    if (course !== undefined) lecture.course = course
    lecture.updated_at = new Date().toISOString()
    if (course !== undefined && course !== before) {
      // Every board with it selected follows it to the new course.
      for (const row of db.workspaceScopes.filter((s) => s.scope_type === 'lecture' && s.scope_value === id)) {
        writeBoardScope(db, row.workspace_id, { lectureId: id })
      }
    }
    return lectureRow(db, lecture)
  })
}
