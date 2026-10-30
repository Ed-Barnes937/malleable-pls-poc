import { describe, it, expect } from 'vitest'
import { defaultLectureTitle } from './lectures'

describe('defaultLectureTitle', () => {
  const at = new Date('2026-10-30T10:04:00Z')

  it('names the course and the local start time', () => {
    expect(defaultLectureTitle('biology', at, 'UTC')).toBe('Biology lecture 30 Oct, 10:04')
  })

  it('reads the time in the given zone', () => {
    // 10:04 UTC is 06:04 in New York (EDT) the same day.
    expect(defaultLectureTitle('chemistry', at, 'America/New_York')).toBe('Chemistry lecture 30 Oct, 06:04')
  })

  it('says just "Lecture" when filed under no course', () => {
    expect(defaultLectureTitle(null, at, 'Europe/London')).toBe('Lecture 30 Oct, 10:04')
  })

  it('uses the 24-hour clock with no leading zero on the day', () => {
    expect(defaultLectureTitle('physics', new Date('2026-11-02T21:30:00Z'), 'UTC')).toBe('Physics lecture 2 Nov, 21:30')
  })
})
