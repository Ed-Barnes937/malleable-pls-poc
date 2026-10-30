import { describe, it, expect } from 'vitest'
import type { PlanItemOccurrence } from '@pls/substrate'
import { comingUpQuery, groupByDay, lookAheadDays } from './coming-up'

const now = new Date(2026, 9, 26, 12, 0).getTime()
const iso = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString()

function deadline(id: string, due_at: string): PlanItemOccurrence {
  return {
    id, kind: 'deadline', title: id, starts_at: null, ends_at: null, due_at, duration_min: null,
    status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null,
    source_offset_ms: null, created_by_workflow_id: null, course: null, created_at: iso(1), updated_at: iso(1),
    occurrence_key: id, series_starts_at: null, series_ends_at: null, series_due_at: due_at,
  }
}

describe('lookAheadDays', () => {
  it('defaults to 14 days', () => {
    expect(lookAheadDays({})).toBe(14)
  })

  it('honours a configured whole number of days', () => {
    expect(lookAheadDays({ lookAheadDays: 7 })).toBe(7)
  })

  it('ignores nonsense config', () => {
    expect(lookAheadDays({ lookAheadDays: 0 })).toBe(14)
    expect(lookAheadDays({ lookAheadDays: 2.5 })).toBe(14)
    expect(lookAheadDays({ lookAheadDays: '7' })).toBe(14)
  })
})

describe('comingUpQuery', () => {
  it('asks for open deadlines up to the end of the last look-ahead day', () => {
    const q = comingUpQuery(14, now, 'biology')
    expect(q).toMatchObject({ kinds: ['deadline'], statuses: ['open'], courseTag: 'biology' })
    // Today is the 26th: 14 days ahead is 9 Nov, so the range ends at local midnight starting 10 Nov.
    expect(q.to).toBe(new Date(2026, 10, 10).toISOString())
  })

  it('starts far enough back that anything still to do is included', () => {
    expect(Date.parse(comingUpQuery(14, now).from!)).toBeLessThan(new Date(2020, 0, 1).getTime())
  })

  it('is stable through the day so the query is not refetched every render', () => {
    expect(comingUpQuery(14, now)).toEqual(comingUpQuery(14, now + 60 * 60 * 1000))
  })
})

describe('groupByDay', () => {
  it('groups by local day, soonest first, with one calm group for anything from earlier', () => {
    const groups = groupByDay(
      [
        deadline('lab', iso(30, 17)), deadline('quiz', iso(29, 10)), deadline('essay', iso(23, 17)),
        deadline('quiz-2', iso(29, 14)), deadline('today', iso(26, 16)), deadline('sheet', iso(20, 17)),
      ],
      now,
    )
    expect(groups.map((g) => [g.heading, g.past, g.items.map((i) => i.id)])).toEqual([
      ['Still to do from earlier (2)', true, ['essay', 'sheet']],
      ['Today', false, ['today']],
      ['Thu 29 Oct', false, ['quiz', 'quiz-2']],
      ['Fri 30 Oct', false, ['lab']],
    ])
  })

  it('files an all-day deadline (local midnight) under its own date', () => {
    const groups = groupByDay([deadline('allday', new Date(2026, 9, 30).toISOString())], now)
    expect(groups.map((g) => g.heading)).toEqual(['Fri 30 Oct'])
  })

  it('has no earlier group when nothing is missed', () => {
    expect(groupByDay([deadline('quiz', iso(29))], now).map((g) => g.past)).toEqual([false])
  })
})

