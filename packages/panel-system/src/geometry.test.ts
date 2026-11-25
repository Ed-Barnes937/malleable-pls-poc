import { describe, it, expect } from 'vitest'
import { canvasBounds, findFreeSpot, placeNewPanel } from './geometry'

const canvas = { width: 800, height: 600 }
const panel = { width: 300, height: 200 }

describe('canvasBounds', () => {
  it('keeps 100px of a large panel on the canvas sideways and along the bottom', () => {
    // visible = min(100, 150, 100) = 100
    expect(canvasBounds(panel, canvas)).toEqual({ minX: 100 - 300, maxX: 800 - 100, minY: 0, maxY: 600 - 100 })
  })

  it('keeps the top edge on the canvas', () => {
    expect(canvasBounds(panel, canvas).minY).toBe(0)
  })

  it('keeps half of a panel smaller than 200px on the canvas', () => {
    // panel 40x40: visible = min(100, 20, 20) = 20
    expect(canvasBounds({ width: 40, height: 40 }, canvas)).toEqual({ minX: -20, maxX: 780, minY: 0, maxY: 580 })
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

  it('keeps the default height on an empty board, even where it ends below the fold', () => {
    // A short laptop: the first widget is not shortened (its height is saved).
    const short = { width: 1280, height: 600 }
    expect(placeNewPanel([], { width: 900, height: 760, minHeight: 400 }, short)).toEqual({ ...findFreeSpot([], { width: 900, height: 760 }, short), height: 760 })
  })

  it('keeps the default height on the narrow (stacked) layout', () => {
    // A phone: the Calendar first, then the To-do under it; neither is shortened.
    const phone = { width: 400, height: 700 }
    const cal = { x: 0, y: 0, width: 900, height: 760 }
    expect(placeNewPanel([cal], { width: 360, height: 440, minHeight: 220 }, phone)).toEqual({ ...findFreeSpot([cal], { width: 360, height: 440 }, phone), height: 440 })
    expect(placeNewPanel([], { width: 900, height: 760, minHeight: 400 }, phone).height).toBe(760)
  })
})
