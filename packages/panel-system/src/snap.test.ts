import { describe, it, expect } from 'vitest'
import { snapToGrid, GRID_SIZE } from './snap'

describe('snapToGrid', () => {
  it('rounds to nearest grid unit', () => {
    expect(snapToGrid(9)).toBe(0)
    expect(snapToGrid(10)).toBe(20)
    expect(snapToGrid(11)).toBe(20)
    expect(snapToGrid(29)).toBe(20)
    expect(snapToGrid(31)).toBe(40)
  })

  it('handles exact grid values', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(20)).toBe(20)
    expect(snapToGrid(40)).toBe(40)
    expect(snapToGrid(100)).toBe(100)
  })

  it('handles negative values', () => {
    expect(snapToGrid(-11)).toBe(-20)
    expect(snapToGrid(-20)).toBe(-20)
    expect(snapToGrid(-25)).toBe(-20)
  })

  it('handles zero', () => {
    expect(snapToGrid(0)).toBe(0)
  })

  it('exports GRID_SIZE as a positive number', () => {
    expect(GRID_SIZE).toBeTypeOf('number')
    expect(GRID_SIZE).toBeGreaterThan(0)
  })
})
