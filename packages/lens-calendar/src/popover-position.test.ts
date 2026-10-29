import { describe, it, expect } from 'vitest'
import { placePopover } from './popover-position'

const desktop = { width: 900, height: 640 }
// A phone's Calendar: about 370px wide, so a 340px popover can't sit beside anything.
const phone = { width: 370, height: 640 }
// A 420px panel on a desktop: the Calendar inside it is about 390px wide, so
// a mouse click places the popover like a tap on a phone.
const narrowPanel = { width: 390, height: 600 }

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

  it('beside the point, the block pressed makes no difference', () => {
    const span = { top: 280, bottom: 360 }
    expect(placePopover({ x: 200, y: 300, span, bounds: desktop, width: 340, height: 320 })).toEqual({ left: 212, top: 276 })
  })

  it('on a phone, goes above the block pressed when there is room, clear of all of it', () => {
    const span = { top: 520, bottom: 580 }
    const pos = placePopover({ x: 180, y: 560, span, bounds: phone, width: 340, height: 360 })
    expect(pos).toEqual({ left: 8, top: 148 })
    expect(pos.top + 360).toBeLessThan(span.top)
  })

  it('on a phone, goes below the block pressed when only that fits', () => {
    expect(placePopover({ x: 180, y: 120, span: { top: 100, bottom: 160 }, bounds: phone, width: 340, height: 360 })).toEqual({ left: 8, top: 172 })
  })

  it('on a phone, covers the block (kept inside) only when neither above nor below fits', () => {
    expect(placePopover({ x: 180, y: 330, span: { top: 300, bottom: 360 }, bounds: phone, width: 340, height: 360 })).toEqual({ left: 8, top: 272 })
  })

  it('with no block (a due marker), keeps clear of the point itself', () => {
    expect(placePopover({ x: 180, y: 560, bounds: phone, width: 340, height: 360 })).toEqual({ left: 8, top: 188 })
  })

  it('in a narrow desktop panel, a click places it above or below the block too, as on a phone', () => {
    const above = placePopover({ x: 200, y: 500, span: { top: 480, bottom: 520 }, bounds: narrowPanel, width: 340, height: 320 })
    expect(above).toEqual({ left: 8, top: 148 })
    const below = placePopover({ x: 200, y: 100, span: { top: 80, bottom: 120 }, bounds: narrowPanel, width: 340, height: 320 })
    expect(below).toEqual({ left: 8, top: 132 })
  })
})
