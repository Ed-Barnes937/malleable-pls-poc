import { describe, it, expect } from 'vitest'
import type { PlanItemOccurrence } from '@pls/substrate'
import { doneToday, orderTodos, slippedAt } from './todo-items'

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
})
