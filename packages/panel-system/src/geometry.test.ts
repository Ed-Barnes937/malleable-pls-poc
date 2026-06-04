import { describe, it, expect } from 'vitest'
import { clampToCanvas, resizeDimensions, anchoredPosition } from './geometry'

const canvas = { width: 800, height: 600 }
const panel = { width: 300, height: 200 }

describe('clampToCanvas', () => {
  it('leaves a panel already in bounds unchanged', () => {
    expect(clampToCanvas({ x: 100, y: 100 }, panel, canvas)).toEqual({ x: 100, y: 100 })
  })

  it('clamps past the right edge', () => {
    // visible = min(100, 150, 100) = 100; max x = 800 - 100 = 700
    expect(clampToCanvas({ x: 750, y: 100 }, panel, canvas)).toEqual({ x: 700, y: 100 })
  })

  it('clamps past the left edge', () => {
    // min x = 100 - 300 = -200
    expect(clampToCanvas({ x: -250, y: 100 }, panel, canvas)).toEqual({ x: -200, y: 100 })
  })

  it('clamps past the bottom edge', () => {
    // max y = 600 - 100 = 500
    expect(clampToCanvas({ x: 100, y: 550 }, panel, canvas)).toEqual({ x: 100, y: 500 })
  })

  it('clamps y to 0 at the top edge', () => {
    expect(clampToCanvas({ x: 100, y: -50 }, panel, canvas)).toEqual({ x: 100, y: 0 })
  })

  it('uses half-dimension as visible when panel is smaller than 200px', () => {
    // panel 40x40 → visible = min(100, 20, 20) = 20; min x = -20; max x = 780
    const small = { width: 40, height: 40 }
    expect(clampToCanvas({ x: -30, y: 0 }, small, canvas)).toEqual({ x: -20, y: 0 })
    expect(clampToCanvas({ x: 790, y: 0 }, small, canvas)).toEqual({ x: 780, y: 0 })
  })
})

describe('resizeDimensions', () => {
  const start = { w: 300, h: 200 }

  it('east handle (dx=1) grows width only', () => {
    expect(resizeDimensions(start, { dx: 1, dy: 0 }, { x: 50, y: 30 })).toEqual({ w: 350, h: 200 })
  })

  it('west handle (dx=-1) shrinks width', () => {
    expect(resizeDimensions(start, { dx: -1, dy: 0 }, { x: 50, y: 0 })).toEqual({ w: 250, h: 200 })
  })

  it('south handle (dy=1) grows height only', () => {
    expect(resizeDimensions(start, { dx: 0, dy: 1 }, { x: 0, y: 40 })).toEqual({ w: 300, h: 240 })
  })

  it('north handle (dy=-1) shrinks height', () => {
    expect(resizeDimensions(start, { dx: 0, dy: -1 }, { x: 0, y: 40 })).toEqual({ w: 300, h: 160 })
  })

  it('se handle grows both axes', () => {
    expect(resizeDimensions(start, { dx: 1, dy: 1 }, { x: 50, y: 40 })).toEqual({ w: 350, h: 240 })
  })

  it('nw handle shrinks both axes', () => {
    expect(resizeDimensions(start, { dx: -1, dy: -1 }, { x: 50, y: 40 })).toEqual({ w: 250, h: 160 })
  })

  it('n handle (dx=0) ignores x delta', () => {
    expect(resizeDimensions(start, { dx: 0, dy: -1 }, { x: 999, y: 40 })).toEqual({ w: 300, h: 160 })
  })
})

describe('anchoredPosition', () => {
  const start = { x: 100, y: 100, w: 300, h: 200 }

  it('east handle: position unchanged', () => {
    expect(anchoredPosition(start, { dx: 1, dy: 0 }, 350, 200)).toEqual({ x: 100, y: 100 })
  })

  it('west handle: x shifts right when size shrinks', () => {
    // clamped w=250 (shrank 50); x = 100 + 300 - 250 = 150
    expect(anchoredPosition(start, { dx: -1, dy: 0 }, 250, 200)).toEqual({ x: 150, y: 100 })
  })

  it('north handle: y shifts down when size shrinks', () => {
    // clamped h=160 (shrank 40); y = 100 + 200 - 160 = 140
    expect(anchoredPosition(start, { dx: 0, dy: -1 }, 300, 160)).toEqual({ x: 100, y: 140 })
  })

  it('nw handle: both axes shift', () => {
    expect(anchoredPosition(start, { dx: -1, dy: -1 }, 250, 160)).toEqual({ x: 150, y: 140 })
  })

  it('se handle: neither axis shifts', () => {
    expect(anchoredPosition(start, { dx: 1, dy: 1 }, 350, 240)).toEqual({ x: 100, y: 100 })
  })

  it('west handle: x shifts left when size grows', () => {
    // clamped w=350 (grew 50); x = 100 + 300 - 350 = 50
    expect(anchoredPosition(start, { dx: -1, dy: 0 }, 350, 200)).toEqual({ x: 50, y: 100 })
  })
})
