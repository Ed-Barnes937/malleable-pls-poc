import { describe, expect, it } from 'vitest'
import {
  captureClassRange,
  classForCapture,
  classLectureTitle,
  isClassBlock,
  occurrenceDate,
  occurrenceOn,
} from './class-occurrences'
import { expandPlanItems } from './plan-items'
import type { PlanItem } from './types'

const item = (fields: Partial<PlanItem>): PlanItem => ({
  id: 'p1', kind: 'commitment', title: 'Biology lecture', starts_at: null, ends_at: null, due_at: null,
  duration_min: null, status: 'open', recurrence: null, subtype: 'class', source_type: null, source_id: null,
  source_offset_ms: null, created_by_workflow_id: null, course: 'biology',
  created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...fields,
})

// Mondays 10:00-12:00 London from Mon 19 Oct 2026 (BST); the clocks go back on Sun 25 Oct.
const bio = item({
  id: 'bio', starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T11:00:00.000Z',
  recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
})

describe('occurrenceDate', () => {
  it("reads the series' zone before the student's", () => {
    // 23:30 London on Sun 25 Oct (GMT) is Mon 26 Oct in Tokyo.
    const late = item({ starts_at: '2026-10-25T23:30:00.000Z', recurrence: { freq: 'weekly', timeZone: 'Europe/London' } })
    expect(occurrenceDate(late, 'Asia/Tokyo')).toBe('2026-10-25')
    expect(occurrenceDate({ ...late, recurrence: null }, 'Asia/Tokyo')).toBe('2026-10-26')
  })

  it('a one-off class near midnight in BST is dated in London, not UTC', () => {
    expect(occurrenceDate(item({ starts_at: '2026-10-20T23:30:00.000Z' }), 'Europe/London')).toBe('2026-10-21')
  })

  it('an undated row has no date', () => {
    expect(occurrenceDate(item({}), 'Europe/London')).toBeNull()
  })
})

describe('occurrenceOn', () => {
  it('finds the occurrence on either side of the clocks going back', () => {
    expect(occurrenceOn(bio, '2026-10-19', 'UTC')?.starts_at).toBe('2026-10-19T09:00:00.000Z')
    expect(occurrenceOn(bio, '2026-10-26', 'UTC')?.starts_at).toBe('2026-10-26T10:00:00.000Z')
    expect(occurrenceOn(bio, '2027-03-29', 'UTC')?.starts_at).toBe('2027-03-29T09:00:00.000Z')
  })

  it('is null on a day the class is not on, before it starts, after it ends, or for a malformed date', () => {
    expect(occurrenceOn(bio, '2026-10-27', 'UTC')).toBeNull()
    expect(occurrenceOn(bio, '2026-10-12', 'UTC')).toBeNull()
    const ended = { ...bio, recurrence: { freq: 'weekly' as const, timeZone: 'Europe/London', until: '2026-10-27T00:00:00.000Z' } }
    expect(occurrenceOn(ended, '2026-10-26', 'UTC')).not.toBeNull()
    expect(occurrenceOn(ended, '2026-11-02', 'UTC')).toBeNull()
    expect(occurrenceOn(bio, '26/10/2026', 'UTC')).toBeNull()
    expect(occurrenceOn(bio, '2026-02-31', 'UTC')).toBeNull()
  })

  it("dates a one-off class in the student's zone", () => {
    const evening = item({ starts_at: '2026-10-21T20:00:00.000Z', ends_at: '2026-10-21T21:00:00.000Z' })
    expect(occurrenceOn(evening, '2026-10-21', 'America/New_York')).not.toBeNull()
    expect(occurrenceOn(evening, '2026-10-21', 'Asia/Tokyo')).toBeNull()
    expect(occurrenceOn(evening, '2026-10-22', 'Asia/Tokyo')).not.toBeNull()
  })
})

describe('isClassBlock', () => {
  it('is a commitment that is a class or has a course', () => {
    expect(isClassBlock(item({}))).toBe(true)
    expect(isClassBlock(item({ subtype: 'lab' }))).toBe(true)
    expect(isClassBlock(item({ subtype: 'class', course: null }))).toBe(true)
    expect(isClassBlock(item({ subtype: 'shift', course: null }))).toBe(false)
    expect(isClassBlock(item({ kind: 'task' }))).toBe(false)
    expect(isClassBlock(item({ kind: 'deadline' }))).toBe(false)
  })
})

describe('classForCapture', () => {
  const rowsAround = (items: PlanItem[], at: number) => expandPlanItems(items, captureClassRange(at))
  const at = (iso: string) => Date.parse(iso)

  it('matches from 15 minutes before the start to the end, in the same course', () => {
    const match = (iso: string, course: string | null = 'biology') => classForCapture(rowsAround([bio], at(iso)), { course, at: at(iso) })
    expect(match('2026-10-26T09:45:00Z')?.starts_at).toBe('2026-10-26T10:00:00.000Z')
    expect(match('2026-10-26T12:00:00Z')).not.toBeNull()
    expect(match('2026-10-26T09:44:59Z')).toBeNull()
    expect(match('2026-10-26T12:00:01Z')).toBeNull()
    expect(match('2026-10-26T11:00:00Z', 'chemistry')).toBeNull()
    expect(match('2026-10-26T11:00:00Z', null)).toBeNull()
  })

  it('on "All courses" (no course) only a class with no course matches; a shift never does', () => {
    const talk = item({ id: 'talk', course: null, starts_at: '2026-10-21T17:00:00.000Z', ends_at: '2026-10-21T18:00:00.000Z' })
    const shift = item({ id: 'shift', subtype: 'shift', course: null, starts_at: '2026-10-21T16:00:00.000Z', ends_at: '2026-10-21T20:00:00.000Z' })
    const when = at('2026-10-21T17:30:00Z')
    expect(classForCapture(rowsAround([talk, shift], when), { course: null, at: when })?.id).toBe('talk')
    expect(classForCapture(rowsAround([shift], when), { course: null, at: when })).toBeNull()
  })

  it('skips classes that are not open, and of overlapping ones takes the one that started last', () => {
    const when = at('2026-10-26T11:30:00Z')
    const later = item({ id: 'seminar', starts_at: '2026-10-26T11:15:00.000Z', ends_at: '2026-10-26T12:30:00.000Z' })
    expect(classForCapture(rowsAround([bio, later], when), { course: 'biology', at: when })?.id).toBe('seminar')
    expect(classForCapture(rowsAround([bio, { ...later, status: 'dismissed' }], when), { course: 'biology', at: when })?.id).toBe('bio')
  })
})

describe('classLectureTitle', () => {
  it('names the lecture after the class and its day', () => {
    expect(classLectureTitle('Biology lecture', '2026-10-28')).toBe('Biology lecture · Wed 28 Oct')
    expect(classLectureTitle('Chemistry lab', '2026-11-02')).toBe('Chemistry lab · Mon 2 Nov')
  })
})
