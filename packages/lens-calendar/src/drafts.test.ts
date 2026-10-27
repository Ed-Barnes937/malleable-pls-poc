import { describe, it, expect } from 'vitest'
import type { PlanItemOccurrence } from '@pls/substrate'
import { draftFromRow, movePatch, newItemFromDraft, patchFromDraft, validateDraft, type Draft } from './drafts'

const iso = (s: string) => new Date(s).toISOString()

function row(patch: Partial<PlanItemOccurrence>): PlanItemOccurrence {
  const base = {
    id: 'p1', kind: 'task', title: 'Read chapter', starts_at: null, ends_at: null, due_at: null,
    duration_min: null, status: 'open', recurrence: null, subtype: null, source_type: null,
    source_id: null, source_offset_ms: null, course: null,
    created_at: iso('2026-10-01T00:00:00Z'), updated_at: iso('2026-10-01T00:00:00Z'),
    ...patch,
  } as PlanItemOccurrence
  return {
    ...base,
    occurrence_key: base.occurrence_key ?? base.id,
    series_starts_at: patch.series_starts_at ?? base.starts_at,
    series_ends_at: patch.series_ends_at ?? base.ends_at,
    series_due_at: patch.series_due_at ?? base.due_at,
  }
}

const draft = (patch: Partial<Draft>): Draft => ({
  kind: 'commitment', title: 'Biology lecture', start: new Date('2026-10-27T09:00:00Z'),
  end: new Date('2026-10-27T10:00:00Z'), course: 'biology', repeatsWeekly: false, ...patch,
})

describe('newItemFromDraft', () => {
  it('makes a weekly class that follows the local wall clock', () => {
    expect(newItemFromDraft(draft({ repeatsWeekly: true }), 'Europe/London')).toEqual({
      kind: 'commitment', title: 'Biology lecture', course: 'biology',
      starts_at: '2026-10-27T09:00:00.000Z', ends_at: '2026-10-27T10:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
    })
  })

  it('makes study time with a duration and never a recurrence', () => {
    const item = newItemFromDraft(draft({ kind: 'task', title: ' Revise ', repeatsWeekly: true, course: null }), 'UTC')
    expect(item).toEqual({
      kind: 'task', title: 'Revise', course: null,
      starts_at: '2026-10-27T09:00:00.000Z', ends_at: '2026-10-27T10:00:00.000Z', duration_min: 60,
    })
  })

  it('makes a deadline due at the start time', () => {
    expect(newItemFromDraft(draft({ kind: 'deadline', title: 'Lab report' }), 'UTC')).toEqual({
      kind: 'deadline', title: 'Lab report', course: 'biology', due_at: '2026-10-27T09:00:00.000Z',
    })
  })
})

describe('validateDraft', () => {
  it('needs a title and an end after the start', () => {
    expect(validateDraft(draft({ title: '  ' }))).toMatch(/name/)
    expect(validateDraft(draft({ end: new Date('2026-10-27T09:00:00Z') }))).toMatch(/End/)
    expect(validateDraft(draft({ kind: 'deadline', end: new Date(0) }))).toBeNull()
    expect(validateDraft(draft({}))).toBeNull()
  })
})

describe('movePatch', () => {
  const block = row({ starts_at: iso('2026-10-27T09:00:00Z'), ends_at: iso('2026-10-27T10:00:00Z'), duration_min: 60 })

  it('moves a block, keeping its length', () => {
    expect(movePatch(block, new Date('2026-10-28T14:00:00Z'), new Date('2026-10-28T15:00:00Z'))).toEqual({
      starts_at: '2026-10-28T14:00:00.000Z', ends_at: '2026-10-28T15:00:00.000Z',
    })
  })

  it('resizes a study block and updates its duration', () => {
    expect(movePatch(block, new Date('2026-10-27T09:00:00Z'), new Date('2026-10-27T10:30:00Z'))).toEqual({
      starts_at: '2026-10-27T09:00:00.000Z', ends_at: '2026-10-27T10:30:00.000Z', duration_min: 90,
    })
  })

  it('shifts a recurring series by the occurrence delta', () => {
    const lecture = row({
      kind: 'commitment', occurrence_key: 'p1@2026-11-03',
      starts_at: iso('2026-11-03T09:00:00Z'), ends_at: iso('2026-11-03T10:00:00Z'),
      series_starts_at: iso('2026-10-06T08:00:00Z'), series_ends_at: iso('2026-10-06T09:00:00Z'),
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
    })
    expect(movePatch(lecture, new Date('2026-11-03T10:00:00Z'), new Date('2026-11-03T11:00:00Z'))).toEqual({
      starts_at: '2026-10-06T09:00:00.000Z', ends_at: '2026-10-06T10:00:00.000Z',
    })
  })
})

describe('patchFromDraft', () => {
  const lecture = row({
    kind: 'commitment', title: 'Biology lecture', course: 'biology',
    starts_at: iso('2026-11-03T09:00:00Z'), ends_at: iso('2026-11-03T10:00:00Z'),
    series_starts_at: iso('2026-10-06T08:00:00Z'), series_ends_at: iso('2026-10-06T09:00:00Z'),
    recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
  })

  it('sends nothing when nothing changed', () => {
    expect(patchFromDraft(lecture, draftFromRow(lecture), 'Europe/London')).toEqual({})
  })

  it('sends only changed fields', () => {
    const d = { ...draftFromRow(lecture), title: 'Bio 101', course: null }
    expect(patchFromDraft(lecture, d, 'Europe/London')).toEqual({ title: 'Bio 101', course: null })
  })

  it('stops repeating by keeping just this occurrence', () => {
    const d = { ...draftFromRow(lecture), repeatsWeekly: false }
    expect(patchFromDraft(lecture, d, 'Europe/London')).toEqual({
      recurrence: null, starts_at: '2026-11-03T09:00:00.000Z', ends_at: '2026-11-03T10:00:00.000Z',
    })
  })

  it('starts repeating a one-off commitment', () => {
    const once = row({ kind: 'commitment', title: 'Shift', starts_at: iso('2026-10-29T17:00:00Z'), ends_at: iso('2026-10-29T21:00:00Z') })
    expect(patchFromDraft(once, { ...draftFromRow(once), repeatsWeekly: true }, 'Europe/London')).toEqual({
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
    })
  })

  it('moves a deadline by its due time', () => {
    const due = row({ kind: 'deadline', title: 'Quiz', due_at: iso('2026-10-29T09:00:00Z') })
    const d = { ...draftFromRow(due), start: new Date('2026-10-29T12:00:00Z') }
    expect(patchFromDraft(due, d, 'UTC')).toEqual({ due_at: '2026-10-29T12:00:00.000Z' })
  })
})
