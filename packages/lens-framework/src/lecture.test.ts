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
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-2' }), lecture)).toBe(true)
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-other' }), lecture)).toBe(false)
    expect(isLinkedToLecture(item({ source_type: 'tag', source_id: 'rec-1' }), lecture)).toBe(false)
  })

  it('is true for its class occurrence only: the class on its date, in the series zone', () => {
    const london = { freq: 'weekly' as const, timeZone: 'Europe/London' }
    expect(isLinkedToLecture(item({ id: 'class-bio', starts_at: '2026-10-27T09:00:00Z', recurrence: london }), lecture)).toBe(true)
    expect(isLinkedToLecture(item({ id: 'class-bio', starts_at: '2026-11-03T09:00:00Z', recurrence: london }), lecture)).toBe(false)
    expect(isLinkedToLecture(item({ id: 'class-chem', starts_at: '2026-10-27T09:00:00Z', recurrence: london }), lecture)).toBe(false)
    // The date is the series zone's: 23:30 UTC on the 26th is the 27th in Tokyo.
    expect(isLinkedToLecture(item({ id: 'class-bio', starts_at: '2026-10-26T23:30:00Z', recurrence: { freq: 'weekly', timeZone: 'Asia/Tokyo' } }), lecture)).toBe(true)
  })

  it('is false for everything without a lecture', () => {
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-1' }), null)).toBe(false)
    expect(isLinkedToLecture(item({ source_type: 'recording', source_id: 'rec-1' }), undefined)).toBe(false)
  })
})
