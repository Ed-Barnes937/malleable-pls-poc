import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { anchoredTop, placePopover, usePopoverPosition } from './popover-position'

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

describe('anchoredTop', () => {
  const base = { top: 200, height: 360, boundsHeight: 640 }

  it('keeps the anchor where it is when content above it grows (the popover grows upward)', () => {
    // The anchor was 200px down and is now 280px down: the top moves up by 80.
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 280, height: 440 })).toBe(120)
  })

  it('keeps the anchor where it is when content above it goes (the popover shrinks upward)', () => {
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 120, height: 280 })).toBe(280)
  })

  it('leaves the top alone when only what is below the anchor changes', () => {
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 200, height: 420 })).toBe(200)
  })

  it('moves the anchor only as far as keeping the popover on the calendar needs', () => {
    // Growing upward by 240 would put the top at -40: held at the margin.
    expect(anchoredTop({ top: 200, anchorBefore: 200, anchorAfter: 440, height: 600, boundsHeight: 640 })).toBe(8)
    // Growing downward past the bottom edge: held to it.
    expect(anchoredTop({ top: 200, anchorBefore: 200, anchorAfter: 200, height: 500, boundsHeight: 640 })).toBe(132)
  })
})

describe('usePopoverPosition', () => {
  /** A popover whose height and buttons' offset the test sets, as its content loads. */
  function popover(height: number, anchor: number) {
    const el = document.createElement('div')
    const row = document.createElement('div')
    row.setAttribute('data-popover-anchor', '')
    el.append(row)
    const size = { height, anchor }
    Object.defineProperty(el, 'offsetHeight', { get: () => size.height })
    el.getBoundingClientRect = () => ({ top: 0 } as DOMRect)
    row.getBoundingClientRect = () => ({ top: size.anchor } as DOMRect)
    return { ref: { current: el }, size }
  }

  it("keeps its buttons where they were when the calendar's box changes after the content grew", () => {
    const observers: (() => void)[] = []
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { observers.push(cb) } observe() {} disconnect() {} })
    const p = popover(440, 374)
    const press = { x: 188, y: 377, span: { top: 367, bottom: 420 }, width: 334 }
    const { result, rerender } = renderHook(({ bounds }) => usePopoverPosition(p.ref, { ...press, bounds }), { initialProps: { bounds: { width: 334, height: 918 } } })
    const buttons = () => result.current.top + p.size.anchor
    const before = buttons()
    // "Also open in" arrives above the buttons: the popover grows around them.
    p.size.height = 562
    p.size.anchor = 496
    act(() => observers.at(-1)!())
    expect(buttons()).toBe(before)
    // A scrollbar narrows the calendar for a frame, then goes.
    rerender({ bounds: { width: 328, height: 918 } })
    rerender({ bounds: { width: 334, height: 918 } })
    expect(buttons()).toBe(before)
    vi.unstubAllGlobals()
  })
})
