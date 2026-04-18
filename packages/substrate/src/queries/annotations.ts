import { query, exec } from '../db'
import type { Annotation, Scope, NewAnnotation } from '../types'

export function getAnnotations(scope: Scope): Annotation[] {
  if (scope.recordingId) {
    return query<Annotation>(
      `SELECT a.* FROM annotations a
       JOIN transcript_segments ts ON a.anchor_type = 'transcript_segment' AND a.anchor_id = ts.id
       WHERE ts.recording_id = ?
       ORDER BY a.created_at DESC`,
      [scope.recordingId]
    )
  }
  return query<Annotation>('SELECT * FROM annotations ORDER BY created_at DESC')
}

export function createAnnotation(ann: NewAnnotation): void {
  const id = crypto.randomUUID()
  exec(
    'INSERT INTO annotations (id, anchor_type, anchor_id, anchor_start_ms, anchor_end_ms, body, created_at, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, ann.anchor_type, ann.anchor_id, ann.anchor_start_ms ?? null, ann.anchor_end_ms ?? null, ann.body, new Date().toISOString(), 'student-1']
  )
}
