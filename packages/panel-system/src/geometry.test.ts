import { describe, it, expect } from 'vitest'
import { clampToCanvas, resizeDimensions, anchoredPosition, findFreeSpot, placeNewPanel } from './geometry'

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

describe('findFreeSpot', () => {
  const size = { width: 300, height: 200 }
  const big = { width: 1200, height: 800 }
  const at = (x: number, y: number, width = 300, height = 200) => ({ x, y, width, height })
  const intersects = (a: ReturnType<typeof at>, b: ReturnType<typeof at>) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

  it('places the first panel at the top-left gap', () => {
    expect(findFreeSpot([], size, big)).toEqual({ x: 20, y: 20 })
  })

  it('places next to an existing panel on the same row', () => {
    expect(findFreeSpot([at(20, 20)], size, big)).toEqual({ x: 340, y: 20 })
  })

  it('wraps to a lower row when the top row is full', () => {
    const row = [at(20, 20), at(340, 20), at(660, 20), at(980, 20, 200)]
    const spot = findFreeSpot(row, size, big)
    expect(spot.y).toBeGreaterThanOrEqual(240)
    expect(row.some((p) => intersects(p, at(spot.x, spot.y)))).toBe(false)
  })

  it('never overlaps any panel and stays inside the canvas when there is room', () => {
    const panels = [at(20, 20, 500, 300), at(600, 100, 300, 500), at(100, 450, 200, 200)]
    const canvas = { width: 1600, height: 900 }
    const spot = findFreeSpot(panels, size, canvas)
    expect(spot).toEqual({ x: 920, y: 20 })
    expect(panels.some((p) => intersects(p, at(spot.x, spot.y)))).toBe(false)
    expect(spot.x + size.width).toBeLessThanOrEqual(canvas.width)
    expect(spot.y + size.height).toBeLessThanOrEqual(canvas.height)
  })

  it('goes below the existing panels, never over them, when the canvas is full', () => {
    // A wide panel fills the top; the bottom strip is too short to clear it.
    const spot = findFreeSpot([at(0, 0, 1200, 700)], size, big)
    expect(spot).toEqual({ x: 20, y: 720 })
  })

  it('fills a gap that runs past the bottom of the canvas before starting a new row', () => {
    // A tall widget on the right leaves free room under the left one, but only
    // by spilling below the 900px canvas (the T12 Calendar + Transcript case).
    const panels = [at(20, 20, 880, 640), at(940, 20, 360, 800)]
    const transcript = { width: 420, height: 380 }
    const spot = findFreeSpot(panels, transcript, { width: 1440, height: 844 })
    expect(spot).toEqual({ x: 20, y: 680 })
    expect(panels.some((p) => intersects(p, { x: spot.x, y: spot.y, ...transcript }))).toBe(false)
  })

  it('never overlaps on a crowded board, whatever the sizes', () => {
    const canvas = { width: 1000, height: 600 }
    const panels: ReturnType<typeof at>[] = []
    for (let i = 0; i < 12; i++) {
      const box = { width: 200 + ((i * 137) % 400), height: 150 + ((i * 89) % 300) }
      const spot = findFreeSpot(panels, box, canvas)
      const placed = { ...spot, ...box }
      expect(panels.some((p) => intersects(p, placed))).toBe(false)
      expect(spot.x + box.width).toBeLessThanOrEqual(canvas.width)
      panels.push(placed)
    }
  })

  it('pins to 0,0 when the panel is bigger than the canvas', () => {
    expect(findFreeSpot([], size, { width: 200, height: 100 })).toEqual({ x: 0, y: 0 })
  })
})

describe('placeNewPanel', () => {
  // The demo board at 1440x900: a board view 771px tall, the Calendar the
  // height of the view on the left, the To-do top right.
  const view = { width: 1440, height: 771 }
  const calendar = { x: 20, y: 11, width: 900, height: 760 }
  const todo = { x: 940, y: 20, width: 360, height: 440 }

  it('uses the default size where it fits in view', () => {
    expect(placeNewPanel([calendar], { width: 360, height: 440, minHeight: 220 }, view)).toEqual({ x: 940, y: 20, height: 440 })
  })

  it('shortens it, down to its minimum, to keep it in view rather than below the fold', () => {
    // Coming up (320px) would end at 800px, under the bottom of the view.
    expect(placeNewPanel([calendar, todo], { width: 360, height: 320, minHeight: 200 }, view)).toEqual({ x: 940, y: 480, height: 271 })
  })

  it('stops short of a widget below the spot', () => {
    const below = { x: 940, y: 700, width: 360, height: 300 }
    expect(placeNewPanel([calendar, todo, below], { width: 360, height: 320, minHeight: 200 }, { width: 1440, height: 1000 }))
      .toEqual({ x: 940, y: 480, height: 200 })
  })

  it('goes below the fold at its default size when not even its minimum fits in view', () => {
    const full = [calendar, { ...todo, height: 600 }]
    expect(placeNewPanel(full, { width: 360, height: 320, minHeight: 200 }, view)).toEqual({ ...findFreeSpot(full, { width: 360, height: 320 }, view), height: 320 })
    // No minimum: never shortened.
    expect(placeNewPanel([calendar, todo], { width: 360, height: 320 }, view)).toEqual({ x: 940, y: 480, height: 320 })
  })
})
