import { query, exec } from '../db'
import type { Tag, Scope, NewTag } from '../types'

export function getTags(scope: Scope): Tag[] {
  if (scope.recordingId) {
    return query<Tag>(
      `SELECT t.* FROM tags t
       JOIN transcript_segments ts ON t.target_type = 'transcript_segment' AND t.target_id = ts.id
       WHERE ts.recording_id = ?
       ORDER BY t.created_at DESC`,
      [scope.recordingId]
    )
  }
  if (scope.courseTag) {
    return query<Tag>(
      `SELECT t.* FROM tags t
       WHERE t.target_type = 'transcript_segment'
       AND t.target_id IN (
         SELECT ts.id FROM transcript_segments ts
         JOIN recordings r ON ts.recording_id = r.id
         JOIN tags ct ON ct.target_type = 'recording' AND ct.target_id = r.id AND ct.label = ?
       )
       ORDER BY t.created_at DESC`,
      [scope.courseTag]
    )
  }
  return query<Tag>(
    "SELECT * FROM tags WHERE target_type = 'transcript_segment' ORDER BY created_at DESC"
  )
}

export function getTagsForTarget(targetType: string, targetId: string): Tag[] {
  return query<Tag>(
    'SELECT * FROM tags WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC',
    [targetType, targetId]
  )
}

export function createTag(tag: NewTag): void {
  const id = crypto.randomUUID()
  exec(
    'INSERT INTO tags (id, target_type, target_id, label, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, tag.target_type, tag.target_id, tag.label, new Date().toISOString()]
  )
}

export function deleteTag(id: string): void {
  exec('DELETE FROM tags WHERE id = ?', [id])
}
