import { describe, it, expect } from 'vitest'
import type { TranscriptSegment } from './types'
import { segmentAtOffset } from './segments'

const seg = (id: string, start_ms: number, end_ms: number): TranscriptSegment => ({
  id, recording_id: 'rec', start_ms, end_ms, text: id, speaker: null,
})

// Deliberately unsorted, with a gap between b and c.
const segments = [seg('c', 30_000, 40_000), seg('a', 0, 10_000), seg('b', 10_000, 20_000)]

describe('segmentAtOffset', () => {
  it('finds the segment containing the offset', () => {
    expect(segmentAtOffset(segments, 0)?.id).toBe('a')
    expect(segmentAtOffset(segments, 15_000)?.id).toBe('b')
    expect(segmentAtOffset(segments, 30_000)?.id).toBe('c')
  })

  it('assigns a moment in a gap to the segment before it', () => {
    expect(segmentAtOffset(segments, 25_000)?.id).toBe('b')
  })

  it('clamps to the first and last segments', () => {
    expect(segmentAtOffset(segments, -5)?.id).toBe('a')
    expect(segmentAtOffset(segments, 99_000)?.id).toBe('c')
  })

  it('returns undefined for an empty transcript', () => {
    expect(segmentAtOffset([], 1000)).toBeUndefined()
  })
})
