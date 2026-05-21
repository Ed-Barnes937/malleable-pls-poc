import { describe, it, expect } from 'vitest'
import { snapToGrid, GRID_SIZE } from './snap'

describe('snapToGrid', () => {
  it('snaps to exact grid multiples', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(20)).toBe(20)
    expect(snapToGrid(40)).toBe(40)
    expect(snapToGrid(100)).toBe(100)
  })

  it('rounds to nearest 20px grid by default', () => {
    expect(snapToGrid(10)).toBe(20) // midpoint rounds up
    expect(snapToGrid(9)).toBe(0)   // below midpoint rounds down
    expect(snapToGrid(11)).toBe(20) // above midpoint rounds up
    expect(snapToGrid(29)).toBe(20)
    expect(snapToGrid(30)).toBe(40) // midpoint rounds up
    expect(snapToGrid(31)).toBe(40)
  })

  it('handles negative values', () => {
    // Math.round(-0.5) === -0 in JS
    expect(snapToGrid(-10)).toBe(-0)
    expect(snapToGrid(-11)).toBe(-20)
    expect(snapToGrid(-20)).toBe(-20)
    expect(snapToGrid(-25)).toBe(-20) // Math.round(-1.25) === -1
    expect(snapToGrid(-30)).toBe(-20) // Math.round(-1.5) === -1 (rounds toward +Infinity)
  })

  it('accepts custom grid size', () => {
    expect(snapToGrid(7, 10)).toBe(10)
    expect(snapToGrid(4, 10)).toBe(0)
    expect(snapToGrid(15, 10)).toBe(20)
    expect(snapToGrid(24, 50)).toBe(0)
    expect(snapToGrid(25, 50)).toBe(50) // midpoint rounds up
  })

  it('has a default GRID_SIZE of 20', () => {
    expect(GRID_SIZE).toBe(20)
  })

  it('returns 0 for 0 input', () => {
    expect(snapToGrid(0)).toBe(0)
  })

  it('handles large values correctly', () => {
    expect(snapToGrid(1003)).toBe(1000)
    expect(snapToGrid(1010)).toBe(1020)
    expect(snapToGrid(1017)).toBe(1020)
  })
})
