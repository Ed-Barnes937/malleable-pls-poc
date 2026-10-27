import { describe, expect, it } from 'vitest'
import { expandPlanItems, validatePlanItem } from '../packages/substrate/src/plan-items'
import type { PlanItem } from '../packages/substrate/src/types'
import { priyaWeek, SEED_TIME_ZONE } from './seed-week'

const at = (iso: string) => Date.parse(iso)

function stored(now: number): PlanItem[] {
  return priyaWeek(now).map((item) => ({
    starts_at: null, ends_at: null, due_at: null, duration_min: null, status: 'open', recurrence: null,
    subtype: null, source_type: null, source_id: null, source_offset_ms: null, course: null,
    created_at: '', updated_at: '',
    ...item,
  }))
}

/** London wall time, e.g. "Mon 10:00", of an ISO instant. */
function london(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SEED_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso)).replace(',', '')
}

function week(now: number, from: string, to: string) {
  const rows = expandPlanItems(stored(now), { from, to })
  return {
    fixed: rows.filter((r) => r.kind === 'commitment').map((r) => `${london(r.starts_at!)}-${london(r.ends_at!).slice(4)} ${r.title}`),
    due: rows.filter((r) => r.kind === 'deadline').map((r) => `${r.due_at} ${r.title}`),
  }
}

describe("Priya's seeded week", () => {
  it('on a Wednesday: lectures and two shifts this week, quiz Thursday, lab report Friday', () => {
    // Wed 28 Oct 2026, just after the clocks went back (25 Oct).
    const w = week(at('2026-10-28T12:00:00Z'), '2026-10-26T00:00:00Z', '2026-11-02T00:00:00Z')
    expect(w.fixed).toEqual([
      'Mon 10:00-12:00 Biology lecture',
      'Tue 14:00-16:00 Chemistry lecture',
      'Tue 17:00-22:00 Cafe shift',
      'Wed 10:00-12:00 Biology lecture',
      'Thu 17:00-22:00 Cafe shift',
    ])
    expect(w.due).toEqual([
      '2026-10-29T10:00:00.000Z Biology quiz',
      '2026-10-30T17:00:00.000Z Chemistry lab report',
    ])
  })

  it('keeps London wall-clock times across a DST change since the series began', () => {
    // Wed 31 Mar 2027: BST since 28 Mar, the series started four weeks earlier in GMT.
    const now = at('2027-03-31T12:00:00Z')
    const series = priyaWeek(now).filter((i) => i.recurrence)
    expect(series.every((i) => Date.parse(i.starts_at!) < at('2027-03-28T00:00:00Z'))).toBe(true)
    const w = week(now, '2027-03-28T23:00:00Z', '2027-04-04T23:00:00Z')
    expect(w.fixed[0]).toBe('Mon 10:00-12:00 Biology lecture')
    expect(w.due).toEqual([
      '2027-04-01T09:00:00.000Z Biology quiz',
      '2027-04-02T16:00:00.000Z Chemistry lab report',
    ])
  })

  it.each([
    ['Mon', '2026-10-26T08:00:00Z', '2026-10-29'],
    ['Thu', '2026-10-29T20:00:00Z', '2026-10-29'],
    ['Fri', '2026-10-30T08:00:00Z', '2026-11-05'],
    ['Sun', '2026-11-01T23:30:00Z', '2026-11-05'], // still Sunday in London (GMT)
  ])('on a %s the quiz is on %s, so the deadlines are never behind', (_day, now, quizDate) => {
    const quiz = priyaWeek(at(now)).find((i) => i.id === 'seed-bio-quiz')!
    expect(quiz.due_at!.slice(0, 10)).toBe(quizDate)
  })

  it('has valid items, fixed unique ids, and 12 hours of unscheduled to-dos with estimates and courses', () => {
    const items = priyaWeek(at('2026-10-28T12:00:00Z'))
    for (const item of items) expect(validatePlanItem(item), item.id).toBeNull()
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    const todos = items.filter((i) => i.kind === 'task')
    expect(todos.length).toBeGreaterThanOrEqual(3)
    expect(todos.every((t) => t.starts_at == null && t.duration_min! > 0 && t.course)).toBe(true)
    expect(todos.reduce((sum, t) => sum + t.duration_min!, 0)).toBe(12 * 60)
    // Shifts are part of no course.
    expect(items.filter((i) => i.subtype === 'shift').every((i) => i.course == null)).toBe(true)
  })
})
