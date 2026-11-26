import { describe, it, expect } from 'vitest'
import { isLinkedToLecture } from './lecture'

const lecture = {
  recordings: [
    { id: 'rec-1', title: 'Part 1', status: 'ready', duration: 1, created_at: '', processing: null },
    { id: 'rec-2', title: 'Part 2', status: 'ready', duration: 1, created_at: '', processing: null },
  ],
  class_item_id: 'class-bio',
  class_date: '2026-10-27',
}
const item = (over: Partial<Parameters<typeof isLinkedToLecture>[0]> = {}) => ({
  id: 'item', source_type: null, source_id: null, starts_at: null, recurrence: null, ...over,
})

describe('isLinkedToLecture', () => {
  it('is true for items made from a moment of any of its recordings', () => {
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-2' }), lecture, 'Europe/London')).toBe(true)
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-other' }), lecture, 'Europe/London')).toBe(false)
    expect(isLinkedToLecture(item({ source_type: 'tag', source_id: 'rec-1' }), lecture, 'Europe/London')).toBe(false)
  })

  it('is true for its class occurrence only: the class on its date, in the series zone', () => {
    const london = { freq: 'weekly' as const, timeZone: 'Europe/London' }
    expect(isLinkedToLecture(item({ id: 'class-bio', starts_at: '2026-10-27T09:00:00Z', recurrence: london }), lecture, 'Europe/London')).toBe(true)
    expect(isLinkedToLecture(item({ id: 'class-bio', starts_at: '2026-11-03T09:00:00Z', recurrence: london }), lecture, 'Europe/London')).toBe(false)
    expect(isLinkedToLecture(item({ id: 'class-chem', starts_at: '2026-10-27T09:00:00Z', recurrence: london }), lecture, 'Europe/London')).toBe(false)
    // The date is the series zone's: 23:30 UTC on the 26th is the 27th in Tokyo.
    expect(isLinkedToLecture(item({ id: 'class-bio', starts_at: '2026-10-26T23:30:00Z', recurrence: { freq: 'weekly', timeZone: 'Asia/Tokyo' } }), lecture, 'Europe/London')).toBe(true)
  })

  it("reads a one-off class's date in the student's zone, not UTC", () => {
    // 23:30 BST on the 24th is 22:30 UTC: the 24th either way.
    const late = item({ id: 'class-bio', starts_at: '2026-10-24T22:30:00Z' })
    const onThe24th = { ...lecture, class_date: '2026-10-24' }
    expect(isLinkedToLecture(late, onThe24th, 'Europe/London')).toBe(true)
    // 00:30 BST on the 25th is 23:30 UTC on the 24th: the 25th in London, not UTC's 24th.
    const justAfter = item({ id: 'class-bio', starts_at: '2026-10-24T23:30:00Z' })
    expect(isLinkedToLecture(justAfter, onThe24th, 'Europe/London')).toBe(false)
    expect(isLinkedToLecture(justAfter, { ...lecture, class_date: '2026-10-25' }, 'Europe/London')).toBe(true)
  })

  it('is false for everything without a lecture', () => {
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-1' }), null, 'Europe/London')).toBe(false)
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-1' }), undefined, 'Europe/London')).toBe(false)
  })
})
