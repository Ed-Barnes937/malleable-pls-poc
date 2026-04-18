import { query } from '../db'
import type { Recording, Scope } from '../types'

export function getRecordings(scope?: Scope): Recording[] {
  if (scope?.recordingId) {
    return query<Recording>('SELECT * FROM recordings WHERE id = ?', [scope.recordingId])
  }
  if (scope?.courseTag) {
    return query<Recording>(
      `SELECT r.* FROM recordings r
       JOIN tags t ON t.target_type = 'recording' AND t.target_id = r.id
       WHERE t.label = ?
       ORDER BY r.created_at DESC`,
      [scope.courseTag]
    )
  }
  return query<Recording>('SELECT * FROM recordings ORDER BY created_at DESC')
}

export function getRecordingById(id: string): Recording | null {
  const results = query<Recording>('SELECT * FROM recordings WHERE id = ?', [id])
  return results[0] ?? null
}
