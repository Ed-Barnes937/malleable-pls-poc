import { query } from '../db'
import type { TranscriptSegment } from '../types'

export function getTranscriptSegments(recordingId: string): TranscriptSegment[] {
  return query<TranscriptSegment>(
    'SELECT * FROM transcript_segments WHERE recording_id = ? ORDER BY start_ms ASC',
    [recordingId]
  )
}
