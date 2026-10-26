import { describe, expect, it } from 'vitest'
import { capacity } from './capacity'

const H = 3_600_000
const slot = (fromH: number, toH: number) => ({ start: fromH * H, end: toH * H })

describe('capacity', () => {
  it('reports a shortfall when tasks need more than is free', () => {
    const free = [slot(8, 12), slot(14, 19)] // 9 hours
    const tasks = [
      { id: 'lab', durationMin: 8 * 60 },
      { id: 'quiz', durationMin: 4 * 60 },
    ]
    expect(capacity(free, tasks)).toEqual({
      freeMin: 540,
      neededMin: 720,
      shortfallMin: 180,
      spareMin: 0,
      fits: false,
    })
  })

  it('reports spare time when everything fits', () => {
    expect(capacity([slot(8, 10)], [{ id: 'a', durationMin: 90 }])).toEqual({
      freeMin: 120,
      neededMin: 90,
      shortfallMin: 0,
      spareMin: 30,
      fits: true,
    })
  })

  it('subtracts fixed existing placements but not those of the counted tasks', () => {
    const r = capacity([slot(8, 12)], [{ id: 'a', durationMin: 60 }], {
      existingPlacements: [
        { taskId: 'a', ...slot(8, 9) }, // a's own block: not double counted
        { taskId: 'other', ...slot(9, 10) },
        slot(10, 10.5),
      ],
    })
    expect(r.freeMin).toBe(150)
    expect(r.neededMin).toBe(60)
  })

  it('counts invalid durations as zero', () => {
    const tasks = [0, -10, NaN, Infinity, 25].map((d, i) => ({ id: `t${i}`, durationMin: d }))
    expect(capacity([], tasks)).toMatchObject({ freeMin: 0, neededMin: 25, shortfallMin: 25, fits: false })
  })
})
