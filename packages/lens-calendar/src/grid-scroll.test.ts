import { describe, expect, it } from 'vitest'
import { gridScrollFor } from './TimeGrid'

// 40px an hour, a 560px view: 08:00-22:00 fits, as in a default Calendar.
const HOUR = 40
const at = (h: number, m = 0) => h * 60 + m
const view = (scrollTop: number) => ({ scrollTop, height: 560 })

describe('gridScrollFor', () => {
  it('leaves the grid alone when the block is already in view', () => {
    // Showing 08:00-22:00 (scrolled to 08:00, less the label room).
    expect(gridScrollFor({ startMin: at(19, 30), endMin: at(19, 50) }, HOUR, view(8 * HOUR - 8))).toBeNull()
  })

  it('shows a morning block from the start of the day, not the night before', () => {
    // Scrolled down to the evening: 09:00 is out of view. The top third would be 04:20.
    const top = gridScrollFor({ startMin: at(9), endMin: at(9, 20) }, HOUR, view(14 * HOUR))!
    expect(top).toBe(8 * HOUR - 8)
  })

  it('puts a later block in the top third', () => {
    const top = gridScrollFor({ startMin: at(23), endMin: at(23, 30) }, HOUR, view(8 * HOUR))!
    expect(top).toBe(23 * HOUR - 560 / 3)
  })

  it('shows a block before the day starts with a little context above it', () => {
    const top = gridScrollFor({ startMin: at(6), endMin: at(6, 30) }, HOUR, view(8 * HOUR))!
    expect(top).toBe(6 * HOUR - HOUR / 2)
  })
})
