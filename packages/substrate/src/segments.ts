import type { TranscriptSegment } from './types'

/**
 * The segment a moment falls in: the last one starting at or before
 * `offsetMs` (a moment in a gap belongs to the segment before it), or the
 * first segment for a moment before the transcript starts.
 */
export function segmentAtOffset(segments: TranscriptSegment[], offsetMs: number): TranscriptSegment | undefined {
  const sorted = [...segments].sort((a, b) => a.start_ms - b.start_ms)
  let match = sorted[0]
  for (const seg of sorted) {
    if (seg.start_ms > offsetMs) break
    match = seg
  }
  return match
}
