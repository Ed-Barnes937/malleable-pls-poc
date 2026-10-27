import { describe, it, expect } from 'vitest'
import { RAIL_TARGET_PX, spreadMarks } from './ScrollRail'

describe('spreadMarks', () => {
  it('puts each 24px target centred where its moment falls', () => {
    expect(spreadMarks([0.25, 0.75], 400)).toEqual([100 - 12, 300 - 12])
  })

  it('nudges close marks apart so their targets never overlap', () => {
    const tops = spreadMarks([0.2, 0.21, 0.22], 400)
    expect(tops[1] - tops[0]).toBeGreaterThanOrEqual(RAIL_TARGET_PX)
    expect(tops[2] - tops[1]).toBeGreaterThanOrEqual(RAIL_TARGET_PX)
    expect(tops[0]).toBe(80 - 12)
  })

  it('keeps every target on the rail, pulling back from the bottom', () => {
    const tops = spreadMarks([0, 0.99, 1], 200)
    expect(tops[0]).toBe(0)
    expect(tops[2]).toBe(200 - RAIL_TARGET_PX)
    expect(tops[2] - tops[1]).toBe(RAIL_TARGET_PX)
  })
})
