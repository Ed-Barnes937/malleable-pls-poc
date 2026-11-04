import {
  DEFAULT_REVIEW_TIME_ZONE,
  LECTURE_SUMMARY_ANCHOR,
  captureClassRange,
  classForCapture,
  classLectureTitle,
  defaultLectureTitle,
  expandPlanItems,
  isClassBlock,
  lectureDeletionFingerprintSource,
  occurrenceDate,
  occurrenceOn,
  withDefaults,
  type BoardScope,
  type Lecture,
  type LectureDeletePreview,
  type PlanItem,
} from '@pls/substrate'
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

export function readBoardScope(db: InMemoryDb, workspaceId: string): BoardScope {
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
 * Twin of the server's `writeBoardScope`: on a board with a course a
 * selected lecture brings its course, while an "All courses" board stays so
 * (I1; naming the lecture with a course it isn't in is BAD_REQUEST), and a
 * course change clears a lecture outside it; "All courses" keeps any (I2).
 */
export function writeBoardScope(
  db: InMemoryDb,
  workspaceId: string,
  patch: { courseTag?: string | null; lectureId?: string | null; courseFollowsLecture?: boolean },
): BoardScope {
  requireBoard(db, workspaceId)
  const current = readBoardScope(db, workspaceId)
  let courseTag = patch.courseTag === undefined ? current.courseTag : patch.courseTag
  let lectureId = patch.lectureId === undefined ? current.lectureId : patch.lectureId
  if (patch.lectureId) {
    const lecture = requireLecture(db, patch.lectureId)
    if (courseTag !== null || patch.courseFollowsLecture) {
      if (patch.courseTag !== undefined && patch.courseTag !== lecture.course) {
        throw new SimulatorError('BAD_REQUEST', "A selected lecture's course is the board course")
      }
      courseTag = lecture.course
    }
  } else if (lectureId) {
    const lecture = db.lectures.find((l) => l.id === lectureId)
    const stays = courseTag === null || lecture?.course === courseTag
    if (!lecture || !stays) lectureId = null
  }
  replaceScopeRow(db, workspaceId, 'tag', courseTag)
  replaceScopeRow(db, workspaceId, 'lecture', lectureId)
  return { courseTag, lectureId }
}

/** The student's zone (their preference, else the caller's browser zone), as the server's `studentTimeZone`. */
function studentTimeZone(db: InMemoryDb, browserZone: string | undefined): string {
  return withDefaults(db.preferences).time_zone ?? browserZone ?? DEFAULT_REVIEW_TIME_ZONE
}

/** A stored plan item with its course (its first 'plan_item' tag), as the server reads it. */
function planItemWithCourse(db: InMemoryDb, id: string): PlanItem | null {
  const row = db.planItems.find((p) => p.id === id)
  if (!row) return null
  const tag = db.tags
    .filter((t) => t.target_type === 'plan_item' && t.target_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]
  return { ...row, course: tag?.label ?? null }
}

/** Twin of the server's `findOrCreateClassLecture`. */
function findOrCreateClassLecture(db: InMemoryDb, planItemId: string, date: string, timeZone: string): { lecture: StoredLecture; created: boolean } {
  const item = planItemWithCourse(db, planItemId)
  if (!item) throw new SimulatorError('NOT_FOUND', 'Class not found')
  if (!isClassBlock(item)) throw new SimulatorError('BAD_REQUEST', 'Not a class')
  const occurrence = occurrenceOn(item, date, timeZone)
  if (!occurrence) throw new SimulatorError('BAD_REQUEST', 'The class is not on that date')
  const existing = db.lectures.find((l) => l.class_item_id === planItemId && l.class_date === date)
  if (existing) return { lecture: existing, created: false }
  const now = new Date().toISOString()
  const lecture: StoredLecture = {
    id: `lec-${crypto.randomUUID().slice(0, 8)}`,
    title: classLectureTitle(item.title, date),
    course: item.course,
    starts_at: occurrence.starts_at!,
    class_item_id: planItemId,
    class_date: date,
    created_at: now,
    updated_at: now,
  }
  db.lectures.push(lecture)
  return { lecture, created: true }
}

/** Twin of the server's `classLectureForCapture`. */
function classLectureForCapture(db: InMemoryDb, course: string | null, at: number, timeZone: string): StoredLecture | null {
  const items = db.planItems
    .map((p) => planItemWithCourse(db, p.id)!)
    .filter((p) => p.kind === 'commitment' && p.status === 'open' && (!course || p.course === course))
  const occurrence = classForCapture(expandPlanItems(items, captureClassRange(at)), { course, at })
  if (!occurrence) return null
  return findOrCreateClassLecture(db, occurrence.id, occurrenceDate(occurrence, timeZone)!, timeZone).lecture
}

/** Twin of the server's `boardStillShows` (undefined: always; null: no lecture). */
function boardStillShows(db: InMemoryDb, workspaceId: string, expected: string | null | undefined): boolean {
  if (expected === undefined) return true
  const { lectureId: current } = readBoardScope(db, workspaceId)
  if (current === null || current === expected) return true
  return !db.lectures.some((l) => l.id === current)
}

/**
 * Twin of the server's `planLectureDeletion`: what deleting a lecture would
 * remove, and `remove()` to do it (the server's `deleteRecordingData` and
 * the cascades). The fingerprint is the unhashed source.
 */
function lectureDeletion(db: InMemoryDb, lecture: StoredLecture): { preview: LectureDeletePreview; remove: () => void } {
  const recordings = db.recordings.filter((r) => r.lecture_id === lecture.id)
  const recordingIds = new Set(recordings.map((r) => r.id))
  const segmentIds = new Set(db.transcriptSegments.filter((s) => recordingIds.has(s.recording_id)).map((s) => s.id))
  const on = (type: string, id: string) =>
    (type === 'recording' && recordingIds.has(id)) || (type === 'transcript_segment' && segmentIds.has(id))
  const tagOn = (t: { target_type: string; target_id: string }) => on(t.target_type, t.target_id)
  const annotationOn = (a: { anchor_type: string; anchor_id: string }) =>
    on(a.anchor_type, a.anchor_id) || (a.anchor_type === LECTURE_SUMMARY_ANCHOR && recordingIds.has(a.anchor_id))
  const linkOn = (l: { source_type: string; source_id: string; target_type: string; target_id: string }) =>
    on(l.source_type, l.source_id) || on(l.target_type, l.target_id)
  const marks = [
    ...db.tags.filter(tagOn).map((t) => `tag:${t.id}`),
    ...db.annotations.filter(annotationOn).map((a) => `annotation:${a.id}`),
    ...db.confidenceSignals.filter(tagOn).map((c) => `confidence:${c.id}`),
    ...db.links.filter(linkOn).map((l) => `link:${l.id}`),
  ]
  const derived = db.planItems
    .filter((p) => p.source_type === 'recording' && p.source_id !== null && recordingIds.has(p.source_id))
    .sort((a, b) => (a.starts_at ?? a.due_at ?? '\uffff').localeCompare(b.starts_at ?? b.due_at ?? '\uffff')
      || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const going = derived.filter((p) => p.status !== 'done')
  const kept = derived.filter((p) => p.status === 'done')
  const resources = db.resources.filter((r) => r.lecture_id === lecture.id)
  const files = resources.filter((r) => r.file_key).length

  const preview: LectureDeletePreview = {
    lecture: { id: lecture.id, title: lecture.title },
    recordings: { count: recordings.length, durationMs: recordings.reduce((sum, r) => sum + r.duration, 0) },
    marks: marks.length,
    planItems: going.map(({ id, title, starts_at, due_at }) => ({ id, title, starts_at, due_at })),
    keptPlanItems: kept.length,
    resources: { count: resources.length, files },
    fingerprint: lectureDeletionFingerprintSource({
      recordings: [...recordingIds],
      segments: [...segmentIds],
      marks,
      planItems: going.map((p) => p.id),
      keptPlanItems: kept.map((p) => p.id),
      resources: resources.map((r) => r.id),
    }),
  }

  const remove = () => {
    const goingIds = new Set(going.map((p) => p.id))
    db.planItems = db.planItems.filter((p) => !goingIds.has(p.id))
    db.tags = db.tags.filter((t) => !(t.target_type === 'plan_item' && goingIds.has(t.target_id)) && !tagOn(t))
    for (const item of kept) Object.assign(item, { source_type: null, source_id: null, source_offset_ms: null })
    db.annotations = db.annotations.filter((a) => !annotationOn(a))
    db.confidenceSignals = db.confidenceSignals.filter((c) => !tagOn(c))
    db.links = db.links.filter((l) => !linkOn(l))
    db.workspaceScopes = db.workspaceScopes.filter((s) => !(s.scope_type === 'lecture' && s.scope_value === lecture.id))
    db.transcriptSegments = db.transcriptSegments.filter((s) => !segmentIds.has(s.id))
    db.recordings = db.recordings.filter((r) => !recordingIds.has(r.id))
    db.resources = db.resources.filter((r) => r.lecture_id !== lecture.id)
    db.lectures = db.lectures.filter((l) => l.id !== lecture.id)
  }
  return { preview, remove }
}

export function registerLecturesHandlers(router: ProcedureRouter, db: InMemoryDb, clock: () => number = Date.now): void {
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
    const { course, title, startsAt, timeZone, workspaceId, matchClass, selectIfBoardShows } = input as {
      course: string | null; title?: string; startsAt?: string; timeZone?: string; workspaceId?: string; matchClass?: boolean
      selectIfBoardShows?: string | null
    }
    requireCourse(course)
    if (workspaceId) requireBoard(db, workspaceId)
    const now = new Date().toISOString()
    const starts = startsAt ? new Date(startsAt) : new Date(clock())
    const zone = studentTimeZone(db, timeZone)
    let lecture = matchClass ? classLectureForCapture(db, course, starts.getTime(), zone) : null
    if (!lecture) {
      lecture = {
        id: `lec-${crypto.randomUUID().slice(0, 8)}`,
        title: title?.trim() || defaultLectureTitle(course, starts, zone),
        course,
        starts_at: starts.toISOString(),
        class_item_id: null,
        class_date: null,
        created_at: now,
        updated_at: now,
      }
      db.lectures.push(lecture)
    }
    // As the server: select only if the board still shows what it did when
    // the caller started (that lecture, none, or one that is gone).
    if (workspaceId && boardStillShows(db, workspaceId, selectIfBoardShows)) writeBoardScope(db, workspaceId, { lectureId: lecture.id })
    return lectureRow(db, lecture)
  })

  router.register('lectures.forClassOccurrence', (input) => {
    const { planItemId, date, workspaceId, timeZone } = input as {
      planItemId: string; date: string; workspaceId?: string; timeZone?: string
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new SimulatorError('BAD_REQUEST', 'Expected YYYY-MM-DD')
    if (workspaceId) requireBoard(db, workspaceId)
    const { lecture, created } = findOrCreateClassLecture(db, planItemId, date, studentTimeZone(db, timeZone))
    let board: { before: BoardScope; after: BoardScope } | null = null
    if (workspaceId) {
      const before = readBoardScope(db, workspaceId)
      board = { before, after: writeBoardScope(db, workspaceId, { lectureId: lecture.id }) }
    }
    return { lecture: lectureRow(db, lecture), created, board }
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

  router.register('lectures.deletePreview', (input) => lectureDeletion(db, requireLecture(db, input as string)).preview)

  router.register('lectures.delete', (input) => {
    const { id, fingerprint } = input as { id: string; fingerprint?: string }
    const lecture = requireLecture(db, id)
    const { preview, remove } = lectureDeletion(db, lecture)
    if (fingerprint !== undefined && fingerprint !== preview.fingerprint) {
      throw new SimulatorError('CONFLICT', 'The lecture has changed since - check what will be deleted')
    }
    remove()
    return { id: lecture.id, title: lecture.title }
  })
}
