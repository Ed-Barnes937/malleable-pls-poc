import { describe, it, expect } from 'vitest'
import { activeScopeDims, canWrite, inDateRange, lookAheadRange, narrowScope, usesScopeDim, weekRange } from './scope'

describe('narrowScope', () => {
  const scope = { courseTag: 'biology', recordingId: 'rec-bio-4' }

  it('drops dimensions the widget ignores', () => {
    expect(narrowScope(scope, { courseTag: 'filter', recordingId: 'ignore' })).toEqual({ courseTag: 'biology' })
    expect(narrowScope(scope, { recordingId: 'target' })).toEqual({ recordingId: 'rec-bio-4' })
    expect(narrowScope(scope, undefined)).toEqual({})
  })

  it('passes through every mode other than ignore', () => {
    expect(narrowScope(scope, { courseTag: 'highlight', recordingId: 'highlight' })).toEqual(scope)
    expect(narrowScope(scope, { courseTag: 'label' })).toEqual({ courseTag: 'biology' })
  })

  it('omits unset dimensions', () => {
    expect(narrowScope({}, { courseTag: 'filter', recordingId: 'target' })).toEqual({})
  })
})

describe('activeScopeDims', () => {
  it('unions used dimensions across widgets', () => {
    const dims = activeScopeDims([
      { scope: { recordingId: 'target' } },
      { scope: { courseTag: 'highlight', recordingId: 'ignore' } },
      {},
    ])
    expect([...dims].sort()).toEqual(['courseTag', 'recordingId'])
  })

  it('is empty when every widget ignores scope', () => {
    expect(activeScopeDims([{ scope: { courseTag: 'ignore' } }, {}]).size).toBe(0)
  })
})

describe('usesScopeDim', () => {
  it('treats an omitted dimension as ignore', () => {
    expect(usesScopeDim({}, 'courseTag')).toBe(false)
    expect(usesScopeDim({ courseTag: 'label' }, 'courseTag')).toBe(true)
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
