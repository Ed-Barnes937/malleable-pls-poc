import { describe, it, expect } from 'vitest'
import { placePopover } from './popover-position'

const desktop = { width: 900, height: 640 }
// A phone's Calendar: about 370px wide, so a 340px popover can't sit beside anything.
const phone = { width: 370, height: 640 }

describe('placePopover', () => {
  it('sits beside the point, a little above it, when there is room', () => {
    expect(placePopover({ x: 200, y: 300, bounds: desktop, width: 340, height: 320 })).toEqual({ left: 212, top: 276 })
  })

  it('flips to the left of the point near the right edge', () => {
    expect(placePopover({ x: 800, y: 300, bounds: desktop, width: 340, height: 320 })).toEqual({ left: 448, top: 276 })
  })

  it('beside a point low in the calendar, it is kept inside, still beside it', () => {
    expect(placePopover({ x: 200, y: 600, bounds: desktop, width: 340, height: 320 })).toEqual({ left: 212, top: 312 })
  })

  it('on a phone, goes above the point when there is room, clear of the finger', () => {
    const pos = placePopover({ x: 180, y: 560, bounds: phone, width: 340, height: 360 })
    expect(pos).toEqual({ left: 8, top: 188 })
    expect(pos.top + 360).toBeLessThan(560)
  })

  it('on a phone, goes below the point when only that fits', () => {
    expect(placePopover({ x: 180, y: 120, bounds: phone, width: 340, height: 360 })).toEqual({ left: 8, top: 132 })
  })

  it('on a phone, covers the point (kept inside) only when neither above nor below fits', () => {
    expect(placePopover({ x: 180, y: 330, bounds: phone, width: 340, height: 360 })).toEqual({ left: 8, top: 272 })
  })
})
