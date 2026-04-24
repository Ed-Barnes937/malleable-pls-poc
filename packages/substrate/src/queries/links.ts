import { query } from '../db'
import type { Link, ConnectionResult } from '../types'

export function getLinks(): Link[] {
  return query<Link>('SELECT * FROM links')
}

export function getConnectionsForConcept(conceptSegmentId: string): ConnectionResult[] {
  return query<ConnectionResult>(
    `SELECT
       l.target_type as sourceType,
       l.target_id as sourceId,
       COALESCE(r.title, ts.text) as sourceTitle,
       COALESCE(r.created_at, '') as sourceDate,
       l.relationship
     FROM links l
     LEFT JOIN recordings r ON l.target_type = 'recording' AND l.target_id = r.id
     LEFT JOIN transcript_segments ts ON l.target_type = 'transcript_segment' AND l.target_id = ts.id
     WHERE l.source_id = ?
     UNION ALL
     SELECT
       l.source_type as sourceType,
       l.source_id as sourceId,
       COALESCE(r.title, ts.text) as sourceTitle,
       COALESCE(r.created_at, '') as sourceDate,
       l.relationship
     FROM links l
     LEFT JOIN recordings r ON l.source_type = 'recording' AND l.source_id = r.id
     LEFT JOIN transcript_segments ts ON l.source_type = 'transcript_segment' AND l.source_id = ts.id
     WHERE l.target_id = ?`,
    [conceptSegmentId, conceptSegmentId]
  )
}

export function getConnectionsForRecording(recordingId: string): ConnectionResult[] {
  return query<ConnectionResult>(
    `SELECT DISTINCT
       l.target_type as sourceType,
       l.target_id as sourceId,
       COALESCE(r2.title, ts2.text) as sourceTitle,
       COALESCE(r2.created_at, '') as sourceDate,
       l.relationship
     FROM links l
     JOIN transcript_segments src ON l.source_type = 'transcript_segment' AND l.source_id = src.id
     LEFT JOIN recordings r2 ON l.target_type = 'recording' AND l.target_id = r2.id
     LEFT JOIN transcript_segments ts2 ON l.target_type = 'transcript_segment' AND l.target_id = ts2.id
     WHERE src.recording_id = ?
     UNION
     SELECT DISTINCT
       l.source_type as sourceType,
       l.source_id as sourceId,
       COALESCE(r2.title, ts2.text) as sourceTitle,
       COALESCE(r2.created_at, '') as sourceDate,
       l.relationship
     FROM links l
     JOIN transcript_segments tgt ON l.target_type = 'transcript_segment' AND l.target_id = tgt.id
     LEFT JOIN recordings r2 ON l.source_type = 'recording' AND l.source_id = r2.id
     LEFT JOIN transcript_segments ts2 ON l.source_type = 'transcript_segment' AND l.source_id = ts2.id
     WHERE tgt.recording_id = ?`,
    [recordingId, recordingId]
  )
}
