import { describe, expect, it } from 'vitest'
import { freeSlots } from './free-slots'
import { MINUTE_MS } from './intervals'
import { place } from './place'

const H = 60 * MINUTE_MS
// Mon 2 Nov 2026, London is on GMT (UTC+0) that week.
const MON = Date.parse('2026-11-02T00:00:00Z')
const at = (day: number, h: number) => MON + day * 24 * H + h * H
const week = { start: MON, end: at(7, 0) }
const tz = 'Europe/London'
const budget = { minutesPerDay: 120, timeZone: tz }
const split = { minSessionMin: 30 }
// 09:00-22:00 every day, nothing booked.
const free = freeSlots([], week, { timeZone: tz, dayStart: '09:00', dayEnd: '22:00' })
const span = (p: { start: number; end: number }) => [(p.start - MON) / H, (p.end - MON) / H]

describe('place with split', () => {
  it('keeps a task whole when it fits in one block', () => {
    const r = place([{ id: 'a', durationMin: 90 }], free, { now: MON, dailyBudget: budget, split })
    expect(r.placements).toEqual([{ taskId: 'a', start: at(0, 9), end: at(0, 10.5) }])
  })

  it('splits a task longer than the daily budget across days, earliest days filled first', () => {
    const r = place([{ id: 'lab', durationMin: 180 }], free, { now: MON, dailyBudget: budget, split })
    expect(r.unplaced).toEqual([])
    expect(r.placements).toEqual([
      { taskId: 'lab', start: at(0, 9), end: at(0, 11) },
      { taskId: 'lab', start: at(1, 9), end: at(1, 10) },
    ])
  })

  it('splits around a gap too short for the whole task, before its due time', () => {
    // Tonight 20:45-22:00 (75m), then Tuesday before a 10:00 due time.
    const r = place([{ id: 'quiz', durationMin: 120, latest: at(1, 10) }], free, {
      now: at(0, 20 + 40 / 60), dailyBudget: budget, split,
    })
    expect(r.placements.map(span)).toEqual([[20.75, 22], [24 + 9, 24 + 9.75]])
    for (const p of r.placements) expect(p.end).toBeLessThanOrEqual(at(1, 10))
  })

  it('prefers the fewest sessions over the earliest ones', () => {
    // Monday has two 45m gaps, Tuesday one long one. 90m fits whole on
    // Tuesday, so it goes there rather than in two Monday sessions.
    const gaps = [
      { start: at(0, 9), end: at(0, 9.75) },
      { start: at(0, 12), end: at(0, 12.75) },
      { start: at(1, 9), end: at(1, 11) },
    ]
    const whole = place([{ id: 'a', durationMin: 90 }], gaps, { now: MON, dailyBudget: budget, split })
    expect(whole.placements.map(span)).toEqual([[33, 34.5]])
    // 150m: two sessions (Mon 45m + Tue 105m) beat three on Monday and Tuesday.
    const two = place([{ id: 'a', durationMin: 150 }], gaps, { now: MON, dailyBudget: { minutesPerDay: 240, timeZone: tz }, split })
    expect(two.placements.map(span)).toEqual([[9, 9.75], [33, 34.75]])
  })

  it('never makes a session shorter than the minimum', () => {
    // 20m and 25m gaps are no use; only the two 40m gaps are.
    const gaps = [
      { start: at(0, 9), end: at(0, 9 + 20 / 60) },
      { start: at(0, 10), end: at(0, 10 + 40 / 60) },
      { start: at(0, 12), end: at(0, 12 + 25 / 60) },
      { start: at(0, 14), end: at(0, 14 + 40 / 60) },
    ]
    const r = place([{ id: 'a', durationMin: 70 }], gaps, { now: MON, split, alignMin: 5 })
    expect(r.placements.map((p) => (p.end - p.start) / MINUTE_MS)).toEqual([40, 30])
    expect(r.placements.map(span)).toEqual([[10, 10 + 40 / 60], [14, 14.5]])
    // 50m can't be two sessions of 30m.
    expect(place([{ id: 'b', durationMin: 50 }], gaps, { now: MON, split }).unplaced)
      .toEqual([{ taskId: 'b', reason: 'no-free-slot' }])
  })

  it('places nothing (rather than part of a task) when the sessions do not all fit', () => {
    const r = place([{ id: 'a', durationMin: 300, latest: at(1, 22) }], free, { now: MON, dailyBudget: budget, split })
    expect(r).toEqual({ placements: [], unplaced: [{ taskId: 'a', reason: 'no-free-slot' }] })
  })

  it('keeps the gap between sessions and other blocks, and counts sessions against the budget', () => {
    const r = place(
      [{ id: 'a', durationMin: 180 }, { id: 'b', durationMin: 60 }],
      free,
      { now: MON, dailyBudget: budget, split, gapMin: 10 },
    )
    // a: Mon 2h + Tue 1h. b: the 1h left on Tuesday, 10 minutes after a.
    expect(r.placements.map((p) => [p.taskId, ...span(p)])).toEqual([
      ['a', 9, 11], ['a', 33, 34], ['b', 34.25, 35.25],
    ])
  })

  it('keeps the gap between two sessions even when their free gaps nearly touch', () => {
    // Free 09:00-10:00 and 10:01-12:00 (say, a due time at 10:00): the second session starts 10 minutes clear.
    const gaps = [{ start: at(0, 9), end: at(0, 10) }, { start: at(0, 10) + MINUTE_MS, end: at(0, 12) }]
    const r = place([{ id: 'a', durationMin: 120 }], gaps, { now: MON, split, gapMin: 10, alignMin: 5, dailyBudget: { minutesPerDay: 240, timeZone: tz } })
    expect(r.placements.map(span)).toEqual([[9, 10], [10 + 10 / 60, 11 + 10 / 60]])
    // Touching pieces (a free stretch cut at midnight) keep it too.
    const night = [{ start: at(0, 22), end: at(1, 2) }]
    const n = place([{ id: 'b', durationMin: 180 }], night, { now: MON, split, gapMin: 10, dailyBudget: { minutesPerDay: 120, timeZone: tz } })
    expect(n.placements.map(span)).toEqual([[22, 24], [24 + 0.25, 24 + 1.25]])
  })

  it('is idempotent when its sessions are fed back in', () => {
    const tasks = [{ id: 'lab', durationMin: 180 }]
    const first = place(tasks, free, { now: MON, dailyBudget: budget, split })
    const again = place(tasks, free, { now: MON, dailyBudget: budget, split, existingPlacements: first.placements })
    expect(again).toEqual(first)
  })

  it('validates its options', () => {
    expect(() => place([], free, { now: MON, split: { minSessionMin: 0 } })).toThrow(RangeError)
    expect(() => place([], free, { now: MON, split: { minSessionMin: 30, maxSessions: 0 } })).toThrow(RangeError)
    expect(() => place([], free, { now: MON, split, anchor: 'latest' })).toThrow(RangeError)
  })
})
