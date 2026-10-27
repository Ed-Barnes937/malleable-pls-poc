import { describe, it, expect } from 'vitest'
import type { PlanItemOccurrence } from '@pls/substrate'
import { doneToday, isFromRecording, orderTodos, slippedAt } from './todo-items'

const now = new Date(2026, 9, 26, 12, 0).getTime()
const iso = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString()

function todo(id: string, fields: Partial<PlanItemOccurrence> = {}): PlanItemOccurrence {
  return {
    id, kind: 'task', title: id, starts_at: null, ends_at: null, due_at: null, duration_min: null,
    status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null,
    source_offset_ms: null, course: null, created_at: iso(20), updated_at: iso(20),
    occurrence_key: id, series_starts_at: null, series_ends_at: null, series_due_at: null,
    ...fields,
  }
}

describe('orderTodos', () => {
  it('puts dated to-dos first, soonest first, then undated in the order added', () => {
    const items = [
      todo('undated-new', { created_at: iso(25) }),
      todo('due-thu', { due_at: iso(29) }),
      todo('undated-old', { created_at: iso(21) }),
      todo('block-tue', { starts_at: iso(27), ends_at: iso(27, 10) }),
      todo('slipped-fri', { due_at: iso(23) }),
    ]
    expect(orderTodos(items).map((t) => t.id)).toEqual(['slipped-fri', 'block-tue', 'due-thu', 'undated-old', 'undated-new'])
  })
})

describe('slippedAt', () => {
  it('is the start of a scheduled block that has ended', () => {
    expect(slippedAt(todo('a', { starts_at: iso(23), ends_at: iso(23, 10) }), now)).toBe(iso(23))
  })

  it('is null for a block still to come or in progress', () => {
    expect(slippedAt(todo('a', { starts_at: iso(26, 11), ends_at: iso(26, 13) }), now)).toBeNull()
  })

  it('is a passed due date for an unscheduled to-do', () => {
    expect(slippedAt(todo('a', { due_at: iso(25) }), now)).toBe(iso(25))
    expect(slippedAt(todo('a', { due_at: iso(27) }), now)).toBeNull()
  })

  it('treats a due date at local midnight as all day: it passes when that day ends', () => {
    expect(slippedAt(todo('a', { due_at: new Date(2026, 9, 26).toISOString() }), now)).toBeNull()
    expect(slippedAt(todo('a', { due_at: new Date(2026, 9, 25).toISOString() }), now)).toBe(new Date(2026, 9, 25).toISOString())
  })

  it('is null for an undated to-do', () => {
    expect(slippedAt(todo('a'), now)).toBeNull()
  })
})

describe('doneToday', () => {
  it('keeps only to-dos ticked off today, in the order they were done', () => {
    const items = [
      todo('done-late', { status: 'done', updated_at: iso(26, 11) }),
      todo('done-yesterday', { status: 'done', updated_at: iso(25) }),
      todo('done-early', { status: 'done', updated_at: iso(26, 8) }),
      todo('open', { updated_at: iso(26, 8) }),
    ]
    expect(doneToday(items, now).map((t) => t.id)).toEqual(['done-early', 'done-late'])
  })

  it('keeps only the latest few', () => {
    const items = [8, 9, 10, 11].map((h) => todo(`done-${h}`, { status: 'done', updated_at: iso(26, h) }))
    expect(doneToday(items, now, 2).map((t) => t.id)).toEqual(['done-10', 'done-11'])
  })
})

describe('isFromRecording', () => {
  it('matches lecture provenance only', () => {
    expect(isFromRecording(todo('a', { source_type: 'recording', source_id: 'rec-1' }), 'rec-1')).toBe(true)
    expect(isFromRecording(todo('a', { source_type: 'tag', source_id: 'rec-1' }), 'rec-1')).toBe(false)
    expect(isFromRecording(todo('a', { source_type: 'recording', source_id: 'rec-1' }), undefined)).toBe(false)
  })
})
