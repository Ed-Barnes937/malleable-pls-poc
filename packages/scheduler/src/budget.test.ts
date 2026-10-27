import { describe, expect, it } from 'vitest'
import { minutesByDay, splitByLocalDay } from './budget'
import { capacity } from './capacity'
import { freeSlots } from './free-slots'
import { MINUTE_MS } from './intervals'
import { place, suggestSlots } from './place'

const H = 60 * MINUTE_MS
// Mon 2 Nov 2026, London is on GMT (UTC+0) that week.
const MON = Date.parse('2026-11-02T00:00:00Z')
const at = (day: number, h: number) => MON + day * 24 * H + h * H
const week = { start: MON, end: at(7, 0) }
const tz = 'Europe/London'
const budget = { minutesPerDay: 120, timeZone: tz }
// 08:00-22:00 every day, nothing booked.
const free = freeSlots([], week, { timeZone: tz })

describe('splitByLocalDay / minutesByDay', () => {
  it('cuts at local midnight, keyed by the local day', () => {
    const pieces = splitByLocalDay([{ start: at(0, 22), end: at(1, 2) }], tz)
    expect(pieces).toEqual([
      { day: at(0, 0), start: at(0, 22), end: at(1, 0) },
      { day: at(1, 0), start: at(1, 0), end: at(1, 2) },
    ])
    expect(minutesByDay([{ start: at(0, 22), end: at(1, 2) }, { start: at(1, 1), end: at(1, 3) }], tz))
      .toEqual(new Map([[at(0, 0), 120], [at(1, 0), 180]]))
  })

  it('handles a 25-hour day across the autumn clock change', () => {
    // London falls back on Sun 25 Oct 2026: that local day is 25 hours long.
    const sun = Date.parse('2026-10-24T23:00:00Z') // local midnight, BST
    const mon = Date.parse('2026-10-26T00:00:00Z') // local midnight, GMT
    const pieces = splitByLocalDay([{ start: sun, end: mon + H }], tz)
    expect(pieces.map((p) => (p.end - p.start) / H)).toEqual([25, 1])
  })

  it('rejects unbounded intervals', () => {
    expect(() => splitByLocalDay([{ start: -Infinity, end: 0 }], tz)).toThrow(RangeError)
  })
})

describe('place with a daily budget', () => {
  it('moves to the next day once a day has used its budget', () => {
    const tasks = [
      { id: 'a', durationMin: 90 },
      { id: 'b', durationMin: 60 },
      { id: 'c', durationMin: 30 },
    ]
    const { placements, unplaced } = place(tasks, free, { now: MON, dailyBudget: budget })
    expect(unplaced).toEqual([])
    // a takes 90 of Monday's 120; b (60) no longer fits Monday, c (30) does.
    expect(placements).toEqual([
      { taskId: 'a', start: at(0, 8), end: at(0, 9.5) },
      { taskId: 'b', start: at(1, 8), end: at(1, 9) },
      { taskId: 'c', start: at(0, 9.5), end: at(0, 10) },
    ])
  })

  it('counts study blocks already on the calendar against their day', () => {
    const { placements } = place([{ id: 'a', durationMin: 60 }], free, {
      now: MON,
      existingPlacements: [{ taskId: 'accepted', start: at(0, 18), end: at(0, 19.5) }],
      dailyBudget: budget,
    })
    expect(placements).toEqual([{ taskId: 'a', start: at(1, 8), end: at(1, 9) }])
  })

  it('reports a task longer than a whole day of budget as over-daily-budget', () => {
    const r = place([{ id: 'lab', durationMin: 240 }], free, { now: MON, dailyBudget: budget })
    expect(r).toEqual({ placements: [], unplaced: [{ taskId: 'lab', reason: 'over-daily-budget' }] })
    expect(suggestSlots({ id: 'lab', durationMin: 240 }, free, 3, { now: MON, dailyBudget: budget })).toEqual([])
  })

  it('reports no-free-slot when every day is spent', () => {
    const spent = Array.from({ length: 7 }, (_, d) => ({ start: at(d, 8), end: at(d, 10) }))
    const r = place([{ id: 'a', durationMin: 30 }], free, { now: MON, existingPlacements: spent, dailyBudget: budget })
    expect(r.unplaced).toEqual([{ taskId: 'a', reason: 'no-free-slot' }])
  })

  it('suggests one slot per day with budget left', () => {
    const s = suggestSlots({ id: 'a', durationMin: 60 }, free, 3, {
      now: MON,
      existingPlacements: [{ start: at(1, 12), end: at(1, 13.5) }],
      dailyBudget: budget,
    })
    // Tuesday has 30 minutes of budget left, so it is skipped.
    expect(s.map((p) => p.start)).toEqual([at(0, 8), at(2, 8), at(3, 8)])
  })

  it('validates the budget', () => {
    expect(() => place([], free, { now: MON, dailyBudget: { minutesPerDay: 0, timeZone: tz } })).toThrow(RangeError)
    expect(() => place([], free, { now: MON, dailyBudget: { minutesPerDay: 60, timeZone: 'Mars/Olympus' } })).toThrow(RangeError)
  })
})

describe('place with gapMin', () => {
  it('keeps a gap after existing and new blocks', () => {
    const { placements } = place(
      [{ id: 'a', durationMin: 60 }, { id: 'b', durationMin: 60 }],
      [{ start: at(0, 8), end: at(0, 12) }],
      { now: MON, existingPlacements: [{ start: at(0, 8), end: at(0, 9) }], gapMin: 10 },
    )
    // 09:00 + 10 min gap, aligned to 09:15; then 10:15 + gap -> 10:30.
    expect(placements.map((p) => p.start)).toEqual([at(0, 9.25), at(0, 10.5)])
  })

  it('validates gapMin', () => {
    expect(() => place([], free, { now: MON, gapMin: -1 })).toThrow(RangeError)
  })
})

describe('capacity with a daily budget', () => {
  it('caps each day at the budget left after scheduled study time', () => {
    const c = capacity(free, [{ id: 'a', durationMin: 12 * 60 }], {
      now: MON,
      existingPlacements: [{ taskId: 'x', start: at(0, 9), end: at(0, 10) }],
      dailyBudget: budget,
    })
    // 7 days x 2h, minus the 1h already scheduled on Monday.
    expect(c).toMatchObject({ freeMin: 13 * 60, neededMin: 720, fits: true })
  })

  it('counts less than the budget on a busy day, and nothing before now', () => {
    const busyFree = [{ start: at(0, 8), end: at(0, 8.5) }, { start: at(1, 8), end: at(1, 22) }]
    const c = capacity(busyFree, [], { now: at(1, 21.5), dailyBudget: budget })
    expect(c.freeMin).toBe(30)
  })

  it('validates the budget', () => {
    expect(() => capacity(free, [], { now: MON, dailyBudget: { minutesPerDay: -5, timeZone: tz } })).toThrow(RangeError)
  })
})
