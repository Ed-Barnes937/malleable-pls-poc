import { describe, it, expect } from 'vitest'
import { activeScopeDims, canWrite, inDateRange, lookAheadRange, splitScope, usesScopeDim, weekRange } from './scope'

describe('splitScope', () => {
  const board = { courseTag: 'biology', lectureId: 'lec-rec-bio-4' }

  it('drops dimensions the widget ignores', () => {
    expect(splitScope(board, { courseTag: 'filter', lectureId: 'ignore' })).toEqual({ scope: { courseTag: 'biology' }, highlight: {} })
    expect(splitScope(board, { lectureId: 'target' })).toEqual({ scope: { lectureId: 'lec-rec-bio-4' }, highlight: {} })
    expect(splitScope(board, undefined)).toEqual({ scope: {}, highlight: {} })
  })

  it('passes filter and target dimensions to readers', () => {
    expect(splitScope(board, { courseTag: 'filter', lectureId: 'target' })).toEqual({ scope: board, highlight: {} })
  })

  it('keeps highlighted dimensions out of what readers see', () => {
    // A calendar passing `scope` straight to its reader must not hide other
    // courses' commitments or items unrelated to the focused lecture.
    const calendar = splitScope(board, { courseTag: 'highlight', lectureId: 'highlight' })
    expect(calendar.scope).toEqual({})
    expect(calendar.highlight).toEqual(board)

    // To-do / Coming up filter by course but only highlight the lecture.
    const todo = splitScope(board, { courseTag: 'filter', lectureId: 'highlight' })
    expect(todo.scope).toEqual({ courseTag: 'biology' })
    expect(todo.highlight).toEqual({ lectureId: 'lec-rec-bio-4' })
  })

  it('omits unset dimensions', () => {
    expect(splitScope({}, { courseTag: 'filter', lectureId: 'highlight' })).toEqual({ scope: {}, highlight: {} })
  })
})

describe('activeScopeDims', () => {
  it('unions used dimensions across widgets', () => {
    const dims = activeScopeDims([
      { scope: { lectureId: 'target' } },
      { scope: { courseTag: 'highlight', lectureId: 'ignore' } },
      {},
    ])
    expect([...dims].sort()).toEqual(['courseTag', 'lectureId'])
  })

  it('is empty when every widget ignores scope', () => {
    expect(activeScopeDims([{ scope: { courseTag: 'ignore' } }, {}]).size).toBe(0)
  })
})

describe('usesScopeDim', () => {
  it('treats an omitted dimension as ignore', () => {
    expect(usesScopeDim({}, 'courseTag')).toBe(false)
    expect(usesScopeDim({ courseTag: 'highlight' }, 'courseTag')).toBe(true)
  })
})

describe('canWrite', () => {
  it('grants writer access only to widgets that declare writes', () => {
    expect(canWrite({ writes: ['tags'] })).toBe(true)
    expect(canWrite({ writes: [] })).toBe(false)
    expect(canWrite({})).toBe(false)
    expect(canWrite(undefined)).toBe(false)
  })
})

describe('date ranges', () => {
  it('weekRange runs Monday to Monday', () => {
    // Sunday 1 Nov 2026, local time.
    const range = weekRange(new Date(2026, 10, 1, 15, 30))
    expect(new Date(range.from)).toEqual(new Date(2026, 9, 26))
    expect(new Date(range.to)).toEqual(new Date(2026, 10, 2))
  })

  it('weekRange on a Monday starts that day', () => {
    const range = weekRange(new Date(2026, 9, 26, 0, 0))
    expect(new Date(range.from)).toEqual(new Date(2026, 9, 26))
  })

  it('lookAheadRange covers whole days from today', () => {
    const range = lookAheadRange(new Date(2026, 9, 26, 18, 0), 14)
    expect(new Date(range.from)).toEqual(new Date(2026, 9, 26))
    expect(new Date(range.to)).toEqual(new Date(2026, 10, 9))
  })

  it('inDateRange is inclusive-exclusive', () => {
    const range = { from: '2026-10-26T00:00:00.000Z', to: '2026-10-27T00:00:00.000Z' }
    expect(inDateRange('2026-10-26T00:00:00.000Z', range)).toBe(true)
    expect(inDateRange('2026-10-26T23:59:59.999Z', range)).toBe(true)
    expect(inDateRange('2026-10-27T00:00:00.000Z', range)).toBe(false)
  })
})
