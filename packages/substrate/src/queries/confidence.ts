import { query, exec } from '../db'
import type { ConfidenceSignal, Scope, NewConfidenceSignal } from '../types'

export function getConfidenceSignals(scope: Scope): ConfidenceSignal[] {
  if (scope.recordingId) {
    return query<ConfidenceSignal>(
      `SELECT cs.* FROM confidence_signals cs
       JOIN transcript_segments ts ON cs.target_type = 'transcript_segment' AND cs.target_id = ts.id
       WHERE ts.recording_id = ?
       ORDER BY cs.created_at DESC`,
      [scope.recordingId]
    )
  }
  if (scope.courseTag) {
    return query<ConfidenceSignal>(
      `SELECT cs.* FROM confidence_signals cs
       WHERE cs.target_type = 'transcript_segment'
       AND cs.target_id IN (
         SELECT ts.id FROM transcript_segments ts
         JOIN recordings r ON ts.recording_id = r.id
         JOIN tags ct ON ct.target_type = 'recording' AND ct.target_id = r.id AND ct.label = ?
       )
       ORDER BY cs.created_at DESC`,
      [scope.courseTag]
    )
  }
  return query<ConfidenceSignal>('SELECT * FROM confidence_signals ORDER BY created_at DESC')
}

export function createConfidenceSignal(signal: NewConfidenceSignal): void {
  const id = crypto.randomUUID()
  exec(
    'INSERT INTO confidence_signals (id, target_type, target_id, score, source_lens_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, signal.target_type, signal.target_id, signal.score, signal.source_lens_id, new Date().toISOString()]
  )
}
