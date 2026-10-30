import type { InMemoryDb } from '../in-memory-db'

/**
 * Simulator twin of the server's `inCourse` (apps/server/src/routers/_shared.ts):
 * a lecture's course is its `course`, a recording's is its lecture's, and a
 * plan item's is a `tags` row on it carrying the course label.
 */
export function inCourse(
  db: InMemoryDb,
  course: string,
  target: 'lecture' | 'recording' | 'plan_item',
  targetId: string | undefined,
): boolean {
  if (!targetId) return false
  if (target === 'lecture') return db.lectures.find((l) => l.id === targetId)?.course === course
  if (target === 'recording') return recordingCourse(db, targetId) === course
  return db.tags.some((t) => t.target_type === target && t.target_id === targetId && t.label === course)
}

/** A recording's course: its lecture's (`recordingCourse` on the server). */
export function recordingCourse(db: InMemoryDb, recordingId: string): string | null {
  const lectureId = db.recordings.find((r) => r.id === recordingId)?.lecture_id
  return db.lectures.find((l) => l.id === lectureId)?.course ?? null
}

/** The recording a transcript segment belongs to. */
export function segmentRecordingId(db: InMemoryDb, segmentId: string): string | undefined {
  return db.transcriptSegments.find((s) => s.id === segmentId)?.recording_id
}

/**
 * Twin of the server's `andInScope`: whether a row belonging to
 * `recordingId` is inside the course, lecture and recording given (each
 * applied when set).
 */
export function inScope(
  db: InMemoryDb,
  scope: { courseTag?: string; lectureId?: string; recordingId?: string } | undefined,
  recordingId: string | undefined,
): boolean {
  if (scope?.courseTag && !inCourse(db, scope.courseTag, 'recording', recordingId)) return false
  if (scope?.lectureId && db.recordings.find((r) => r.id === recordingId)?.lecture_id !== scope.lectureId) return false
  if (scope?.recordingId && recordingId !== scope.recordingId) return false
  return true
}

/** True when the scope narrows by anything (`isScoped` on the server). */
export function isScoped(scope: { courseTag?: string; lectureId?: string; recordingId?: string } | undefined): boolean {
  return !!(scope?.courseTag || scope?.lectureId || scope?.recordingId)
}

/** Mirrors the server's `recordingProcessing`: what a recording's AI jobs are still doing. */
export function recordingProcessing(db: InMemoryDb, recordingId: string): 'transcribing' | 'summarising' | null {
  const busy = db.jobRuns.filter((j) => {
    if (j.status !== 'pending' && j.status !== 'running') return false
    if (j.job_type !== 'ai:transcribe' && j.job_type !== 'ai:summarize-lecture') return false
    const input = j.input ? (JSON.parse(j.input) as { recording_id?: string; target_id?: string }) : {}
    return (input.recording_id ?? input.target_id) === recordingId
  })
  if (busy.some((j) => j.job_type === 'ai:transcribe')) return 'transcribing'
  return busy.length > 0 ? 'summarising' : null
}
