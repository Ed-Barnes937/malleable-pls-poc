import { describe, it, expect } from 'vitest'
import { lectureAudio, lectureStatus } from './ClassLectureSection'

describe('lectureStatus', () => {
  const start = Date.parse('2026-10-27T10:00:00Z')
  const occurrence = { starts_at: '2026-10-27T10:00:00Z', ends_at: '2026-10-27T11:00:00Z' }
  const min = 60_000

  it('says how much is recorded once the lecture has audio, whenever the class is', () => {
    expect(lectureStatus(lectureAudio([{ duration: 52 * min }]), occurrence, start + 5 * 24 * 60 * min)).toBe('Recorded · 52 min')
    expect(lectureStatus(lectureAudio([{ duration: 40 * min }, { duration: 25 * min }]), occurrence, start)).toBe('Recorded · 1 h 05')
    expect(lectureStatus(lectureAudio([{ duration: 0 }]), occurrence, start)).toBe('Recorded')
    expect(lectureStatus({ recordingCount: 1, durationMs: 52 * min }, occurrence, start)).toBe('Recorded · 52 min')
  })

  it('without audio: on now from 15 minutes before the start to the end, upcoming before, no recording after', () => {
    expect(lectureStatus(lectureAudio([]), occurrence, start - 16 * min)).toBe('Upcoming')
    expect(lectureStatus(lectureAudio([]), occurrence, start - 15 * min)).toBe('On now')
    expect(lectureStatus(undefined, occurrence, start + 60 * min)).toBe('On now')
    expect(lectureStatus(lectureAudio([]), occurrence, start + 61 * min)).toBe('No recording yet')
  })
})
