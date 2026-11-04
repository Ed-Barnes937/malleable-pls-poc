import { describe, expect, it } from 'vitest'
import { bookedMinutes, isSession, newSession, sessionParentId, todosToPlan } from './sessions'

const session = (parent: string, start: string, end: string, status: 'open' | 'done' | 'dismissed' = 'open') => ({
  kind: 'task' as const, source_type: 'plan_item', source_id: parent, status, starts_at: start, ends_at: end,
})

describe('sessions', () => {
  it('knows a session by its link to a to-do, and nothing else', () => {
    expect(sessionParentId(session('lab', '2026-11-05T09:00:00Z', '2026-11-05T10:00:00Z'))).toBe('lab')
    expect(isSession({ kind: 'task', source_type: 'recording', source_id: 'rec-1' })).toBe(false)
    expect(isSession({ kind: 'deadline', source_type: 'plan_item', source_id: 'lab' })).toBe(false)
    expect(isSession({ kind: 'task', source_type: 'plan_item', source_id: null })).toBe(false)
  })

  it('adds up booked minutes per to-do, leaving out dismissed sessions and other rows', () => {
    const rows = [
      session('lab', '2026-11-05T09:00:00Z', '2026-11-05T11:00:00Z'),
      session('lab', '2026-11-06T09:00:00Z', '2026-11-06T09:45:00Z', 'done'),
      session('lab', '2026-11-07T09:00:00Z', '2026-11-07T10:00:00Z', 'dismissed'),
      session('quiz', '2026-11-05T12:00:00Z', '2026-11-05T12:30:00Z'),
      { kind: 'task' as const, source_type: null, source_id: null, status: 'open' as const, starts_at: '2026-11-05T13:00:00Z', ends_at: '2026-11-05T14:00:00Z' },
    ]
    expect(bookedMinutes(rows)).toEqual(new Map([['lab', 165], ['quiz', 30]]))
  })

  it('plans only what is not booked yet, and drops a to-do once it is all booked', () => {
    const todos = [
      { id: 'lab', duration_min: 180 },
      { id: 'quiz', duration_min: 30 },
      { id: 'essay', duration_min: 120 },
      { id: 'cards', duration_min: null },
    ]
    const booked = new Map([['lab', 120], ['quiz', 30], ['cards', 30]])
    expect(todosToPlan(todos, booked)).toEqual([{ id: 'lab', duration_min: 60 }, { id: 'essay', duration_min: 120 }])
    // The input rows keep their totals.
    expect(todos[0].duration_min).toBe(180)
  })

  it('makes a session that carries the to-do\'s title, course and due time', () => {
    const todo = { id: 'lab', title: 'Lab report write-up', course: 'chemistry', due_at: '2026-11-06T17:00:00.000Z' }
    expect(newSession(todo, '2026-11-05T09:00:00.000Z', '2026-11-05T10:30:00.000Z')).toEqual({
      kind: 'task', title: 'Lab report write-up', course: 'chemistry', due_at: todo.due_at,
      starts_at: '2026-11-05T09:00:00.000Z', ends_at: '2026-11-05T10:30:00.000Z', duration_min: 90,
      source_type: 'plan_item', source_id: 'lab',
    })
  })
})
