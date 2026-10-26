import type { InMemoryDb } from '../in-memory-db'

/**
 * Simulator twin of the server's `inCourse` (apps/server/src/routers/_shared.ts):
 * a target is in a course when a `tags` row on it carries the course label.
 */
export function inCourse(
  db: InMemoryDb,
  course: string,
  target: 'recording' | 'plan_item',
  targetId: string | undefined,
): boolean {
  if (!targetId) return false
  return db.tags.some((t) => t.target_type === target && t.target_id === targetId && t.label === course)
}

/** The recording a transcript segment belongs to. */
export function segmentRecordingId(db: InMemoryDb, segmentId: string): string | undefined {
  return db.transcriptSegments.find((s) => s.id === segmentId)?.recording_id
}
