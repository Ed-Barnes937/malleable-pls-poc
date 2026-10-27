import { describe, it, expect } from 'vitest'
import { expandPlanItems, matchesPlanItemFilters, validatePlanItem, shiftByWallClock, MAX_OCCURRENCES_PER_ITEM } from './plan-items'
import type { PlanItem } from './types'

function item(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: 'pi-1',
    kind: 'commitment',
    title: 'Biology lecture',
    starts_at: null,
    ends_at: null,
    due_at: null,
    duration_min: null,
    status: 'open',
    recurrence: null,
    subtype: null,
    source_type: null,
    source_id: null,
    source_offset_ms: null,
    created_by_workflow_id: null,
    course: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

const starts = (rows: { starts_at: string | null }[]) => rows.map((r) => r.starts_at)

describe('expandPlanItems - weekly recurrence', () => {
  // Monday 10:00-11:00 UTC
  const weekly = item({
    starts_at: '2026-10-05T10:00:00.000Z',
    ends_at: '2026-10-05T11:00:00.000Z',
    recurrence: { freq: 'weekly' },
  })

  it('returns one occurrence per week inside the range', () => {
    const rows = expandPlanItems([weekly], { from: '2026-10-05T00:00:00Z', to: '2026-10-26T00:00:00Z' })
    expect(starts(rows)).toEqual([
      '2026-10-05T10:00:00.000Z',
      '2026-10-12T10:00:00.000Z',
      '2026-10-19T10:00:00.000Z',
    ])
    expect(rows.every((r) => r.id === 'pi-1')).toBe(true)
    expect(new Set(rows.map((r) => r.occurrence_key)).size).toBe(3)
  })

  it('keeps the stored series times on every occurrence row', () => {
    const rows = expandPlanItems([weekly], { from: '2026-10-12T00:00:00Z', to: '2026-10-26T00:00:00Z' })
    expect(rows.map((r) => [r.starts_at, r.series_starts_at, r.series_ends_at])).toEqual([
      ['2026-10-12T10:00:00.000Z', '2026-10-05T10:00:00.000Z', '2026-10-05T11:00:00.000Z'],
      ['2026-10-19T10:00:00.000Z', '2026-10-05T10:00:00.000Z', '2026-10-05T11:00:00.000Z'],
    ])
  })

  it('treats the range as [from, to): an occurrence starting exactly at `to` is excluded, one ending exactly at `from` too', () => {
    const rows = expandPlanItems([weekly], { from: '2026-10-12T11:00:00Z', to: '2026-10-19T10:00:00Z' })
    expect(rows).toEqual([])
  })

  it('includes an occurrence that started before the range but overlaps it', () => {
    const rows = expandPlanItems([weekly], { from: '2026-10-12T10:30:00Z', to: '2026-10-12T12:00:00Z' })
    expect(starts(rows)).toEqual(['2026-10-12T10:00:00.000Z'])
    expect(rows[0].ends_at).toBe('2026-10-12T11:00:00.000Z')
  })

  it('expands across a week boundary (Sunday night into Monday) for a range a year later', () => {
    const lateSunday = item({
      starts_at: '2026-10-04T23:30:00.000Z',
      ends_at: '2026-10-05T00:30:00.000Z',
      recurrence: { freq: 'weekly' },
    })
    // A Monday-to-Monday week view one year on still catches the half that spills over.
    const rows = expandPlanItems([lateSunday], { from: '2027-10-04T00:00:00Z', to: '2027-10-11T00:00:00Z' })
    expect(starts(rows)).toEqual(['2027-10-03T23:30:00.000Z', '2027-10-10T23:30:00.000Z'])
  })

  it('never yields occurrences before the series starts', () => {
    const rows = expandPlanItems([weekly], { from: '2026-09-01T00:00:00Z', to: '2026-10-10T00:00:00Z' })
    expect(starts(rows)).toEqual(['2026-10-05T10:00:00.000Z'])
  })

  it('stops at `until` (inclusive)', () => {
    const bounded = item({ ...weekly, recurrence: { freq: 'weekly', until: '2026-10-19T10:00:00Z' } })
    const rows = expandPlanItems([bounded], { from: '2026-10-01T00:00:00Z', to: '2026-12-01T00:00:00Z' })
    expect(starts(rows)).toEqual([
      '2026-10-05T10:00:00.000Z',
      '2026-10-12T10:00:00.000Z',
      '2026-10-19T10:00:00.000Z',
    ])
  })

  it('caps the number of occurrences per item', () => {
    const rows = expandPlanItems([weekly], { from: '2026-10-01T00:00:00Z', to: '2100-01-01T00:00:00Z' })
    expect(rows.length).toBe(MAX_OCCURRENCES_PER_ITEM)
  })

  it('shifts a recurring due_at along with the occurrence', () => {
    const problemSet = item({
      kind: 'commitment',
      starts_at: '2026-10-05T09:00:00.000Z',
      ends_at: '2026-10-05T10:00:00.000Z',
      due_at: '2026-10-09T17:00:00.000Z',
      recurrence: { freq: 'weekly' },
    })
    const rows = expandPlanItems([problemSet], { from: '2026-10-12T00:00:00Z', to: '2026-10-19T00:00:00Z' })
    expect(rows.map((r) => r.due_at)).toEqual(['2026-10-16T17:00:00.000Z'])
    expect(rows[0].series_due_at).toBe('2026-10-09T17:00:00.000Z')
  })
})

describe('expandPlanItems - DST', () => {
  // Europe/London: BST ends Sun 25 Oct 2026 02:00 BST, starts Sun 28 Mar 2027 01:00 GMT.
  it('keeps local wall-clock time across the autumn change', () => {
    const lecture = item({
      starts_at: '2026-10-19T09:00:00.000Z', // Mon 10:00 BST
      ends_at: '2026-10-19T10:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
    })
    const rows = expandPlanItems([lecture], { from: '2026-10-19T00:00:00Z', to: '2026-11-03T00:00:00Z' })
    expect(starts(rows)).toEqual([
      '2026-10-19T09:00:00.000Z', // 10:00 BST
      '2026-10-26T10:00:00.000Z', // 10:00 GMT
      '2026-11-02T10:00:00.000Z',
    ])
    expect(rows.map((r) => Date.parse(r.ends_at!) - Date.parse(r.starts_at!))).toEqual([3600000, 3600000, 3600000])
  })

  it('keeps local wall-clock time across the spring change', () => {
    const shift = item({
      starts_at: '2027-03-25T18:00:00.000Z', // Thu 18:00 GMT
      ends_at: '2027-03-25T22:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
    })
    const rows = expandPlanItems([shift], { from: '2027-03-22T00:00:00Z', to: '2027-04-05T00:00:00Z' })
    expect(starts(rows)).toEqual([
      '2027-03-25T18:00:00.000Z', // 18:00 GMT
      '2027-04-01T17:00:00.000Z', // 18:00 BST
    ])
  })

  it('keeps wall-clock time for a series that sits on the DST day itself', () => {
    // Sunday 01:30 local happens twice on 25 Oct 2026 in London; one instant is chosen.
    const sunday = item({
      starts_at: '2026-10-18T00:30:00.000Z', // Sun 01:30 BST
      ends_at: '2026-10-18T01:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
    })
    const rows = expandPlanItems([sunday], { from: '2026-10-18T00:00:00Z', to: '2026-11-02T00:00:00Z' })
    expect(rows).toHaveLength(3)
    expect(starts(rows)[2]).toBe('2026-11-01T01:30:00.000Z') // Sun 01:30 GMT
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(starts(rows)[1])
  })

  it('follows a southern-hemisphere zone whose clocks go forward in October', () => {
    // Sydney: AEST -> AEDT on Sun 4 Oct 2026.
    const tutorial = item({
      starts_at: '2026-09-28T23:00:00.000Z', // Tue 09:00 AEST
      ends_at: '2026-09-29T00:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Australia/Sydney' },
    })
    const rows = expandPlanItems([tutorial], { from: '2026-09-28T00:00:00Z', to: '2026-10-08T00:00:00Z' })
    expect(starts(rows)).toEqual([
      '2026-09-28T23:00:00.000Z', // 09:00 AEST (+10)
      '2026-10-05T22:00:00.000Z', // 09:00 AEDT (+11)
    ])
  })

  it('uses UTC when no time zone is given (no wall-clock shift)', () => {
    const utc = item({
      starts_at: '2026-10-19T09:00:00.000Z',
      ends_at: '2026-10-19T10:00:00.000Z',
      recurrence: { freq: 'weekly' },
    })
    const rows = expandPlanItems([utc], { from: '2026-10-19T00:00:00Z', to: '2026-10-27T00:00:00Z' })
    expect(starts(rows)).toEqual(['2026-10-19T09:00:00.000Z', '2026-10-26T09:00:00.000Z'])
  })
})

describe('expandPlanItems - one-off items', () => {
  const block = item({ id: 'task', kind: 'task', starts_at: '2026-10-21T18:00:00.000Z', ends_at: '2026-10-21T18:20:00.000Z' })
  const quiz = item({ id: 'quiz', kind: 'deadline', due_at: '2026-10-22T09:00:00.000Z' })
  const undated = item({ id: 'undated', kind: 'task', duration_min: 30 })

  it('returns everything unexpanded without a range, sorted by time', () => {
    const rows = expandPlanItems([quiz, undated, block])
    expect(rows.map((r) => r.occurrence_key)).toEqual(['undated', 'task', 'quiz'])
    expect(rows[1]).toMatchObject({ series_starts_at: block.starts_at, series_ends_at: block.ends_at })
  })

  it('matches scheduled spans and due dates in range, and drops undated items', () => {
    const rows = expandPlanItems([quiz, undated, block], { from: '2026-10-19T00:00:00Z', to: '2026-10-26T00:00:00Z' })
    expect(rows.map((r) => r.id)).toEqual(['task', 'quiz'])
  })

  it('excludes a due date exactly at the range end', () => {
    const rows = expandPlanItems([quiz], { from: '2026-10-15T00:00:00Z', to: '2026-10-22T09:00:00Z' })
    expect(rows).toEqual([])
  })
})

describe('matchesPlanItemFilters', () => {
  const bio = item({ kind: 'task', status: 'open', course: 'biology', source_type: 'recording', source_id: 'rec-1' })

  it('filters by kind, status, course and source', () => {
    expect(matchesPlanItemFilters(bio, {})).toBe(true)
    expect(matchesPlanItemFilters(bio, { kinds: ['task', 'deadline'] })).toBe(true)
    expect(matchesPlanItemFilters(bio, { kinds: ['commitment'] })).toBe(false)
    expect(matchesPlanItemFilters(bio, { statuses: ['done'] })).toBe(false)
    expect(matchesPlanItemFilters(bio, { courseTag: 'biology' })).toBe(true)
    expect(matchesPlanItemFilters(bio, { courseTag: 'chemistry' })).toBe(false)
    expect(matchesPlanItemFilters(bio, { sourceType: 'recording', sourceId: 'rec-1' })).toBe(true)
    expect(matchesPlanItemFilters(bio, { sourceId: 'rec-2' })).toBe(false)
    expect(matchesPlanItemFilters(bio, { scheduled: false })).toBe(true)
    expect(matchesPlanItemFilters(bio, { scheduled: true })).toBe(false)
    const placed = { ...bio, starts_at: '2026-10-21T18:00:00Z', ends_at: '2026-10-21T18:20:00Z' }
    expect(matchesPlanItemFilters(placed, { scheduled: true })).toBe(true)
  })
})

describe('validatePlanItem', () => {
  it('accepts each kind in its minimal shape', () => {
    expect(validatePlanItem({ kind: 'commitment', starts_at: '2026-10-19T09:00:00Z', ends_at: '2026-10-19T10:00:00Z' })).toBeNull()
    expect(validatePlanItem({ kind: 'deadline', due_at: '2026-10-22T09:00:00Z' })).toBeNull()
    expect(validatePlanItem({ kind: 'task' })).toBeNull()
  })

  it('rejects shapes the table would refuse', () => {
    expect(validatePlanItem({ kind: 'commitment' })).toMatch(/commitment/)
    expect(validatePlanItem({ kind: 'deadline' })).toMatch(/due_at/)
    expect(validatePlanItem({ kind: 'task', starts_at: '2026-10-19T09:00:00Z' })).toMatch(/together/)
    expect(validatePlanItem({ kind: 'task', starts_at: '2026-10-19T10:00:00Z', ends_at: '2026-10-19T09:00:00Z' })).toMatch(/after/)
    expect(validatePlanItem({ kind: 'task', duration_min: 0 })).toMatch(/positive/)
    expect(validatePlanItem({ kind: 'task', recurrence: { freq: 'weekly' } })).toMatch(/only commitments/)
    expect(validatePlanItem({
      kind: 'task', starts_at: '2026-10-19T09:00:00Z', ends_at: '2026-10-19T10:00:00Z', recurrence: { freq: 'weekly' },
    })).toMatch(/only commitments/)
    expect(validatePlanItem({ kind: 'commitment', recurrence: { freq: 'weekly' } })).toMatch(/commitment needs/)
    expect(validatePlanItem({
      kind: 'commitment', starts_at: '2026-10-19T09:00:00Z', ends_at: '2026-10-19T10:00:00Z',
      recurrence: { freq: 'weekly', until: '2026-10-12T09:00:00Z' },
    })).toMatch(/until/)
    expect(validatePlanItem({
      kind: 'commitment', starts_at: '2026-10-19T09:00:00Z', ends_at: '2026-10-19T10:00:00Z',
      recurrence: { freq: 'weekly', timeZone: 'Mars/Olympus' },
    })).toMatch(/time zone/)
  })
})

describe('shiftByWallClock', () => {
  const t = (v: string) => Date.parse(v)
  const iso = (n: number) => new Date(n).toISOString()

  it('shifts by the local-time difference across a DST change', () => {
    // Sat 24 Oct 10:00 BST -> Sun 25 Oct 10:00 GMT is 25h of real time, but one
    // day later at the same local time; a September anchor moves to 10:00 BST.
    const from = t('2026-10-24T09:00:00Z')
    const to = t('2026-10-25T10:00:00Z')
    expect(iso(shiftByWallClock(t('2026-09-05T09:00:00Z'), from, to, 'Europe/London'))).toBe('2026-09-06T09:00:00.000Z')
  })

  it('matches a plain ms shift when no clock change is involved', () => {
    const from = t('2026-11-03T10:00:00Z')
    const to = t('2026-11-03T11:30:00Z')
    expect(iso(shiftByWallClock(t('2026-11-10T10:00:00Z'), from, to, 'Europe/London'))).toBe('2026-11-10T11:30:00.000Z')
    expect(iso(shiftByWallClock(t('2026-09-07T09:00:00Z'), from, to, 'UTC'))).toBe('2026-09-07T10:30:00.000Z')
  })
})
