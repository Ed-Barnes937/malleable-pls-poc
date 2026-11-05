import { describe, it, expect } from 'vitest'
import { clampToCanvas, resizeDimensions, anchoredPosition, findFreeSpot, placeNewPanel, layoutGroup, STACK_BREAKPOINT } from './geometry'

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

describe('layoutGroup', () => {
  // The "Capture a lecture" starter's widgets: Audio Capture, Transcript, Resources.
  const record = { width: 380, height: 280, minWidth: 280, minHeight: 200 }
  const transcript = { width: 420, height: 380, minWidth: 300, minHeight: 250 }
  const resources = { width: 360, height: 440, minWidth: 280, minHeight: 240 }
  const capture = [record, transcript, resources]

  type Box = { x: number; y: number; width: number; height: number }
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  function expectTidy(boxes: Box[], view: { width: number; height: number }, opts: { scrolls?: boolean } = {}) {
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(20)
      expect(b.y).toBeGreaterThanOrEqual(20)
      expect(b.x + b.width).toBeLessThanOrEqual(view.width - 20)
      if (!opts.scrolls) expect(b.y + b.height).toBeLessThanOrEqual(view.height - 20)
      for (const other of boxes) if (other !== b) expect(overlaps(b, other)).toBe(false)
    }
  }

  it('puts the widgets in one row at default widths when they fit, heights filling the view', () => {
    const view = { width: 1440, height: 800 }
    const boxes = layoutGroup(capture, view)
    expect(boxes).toEqual([
      { x: 20, y: 20, width: 380, height: 760 },
      { x: 420, y: 20, width: 420, height: 760 },
      { x: 860, y: 20, width: 360, height: 760 },
    ])
    expectTidy(boxes, view)
  })

  it('goes to two columns at default widths rather than shrink the row', () => {
    // The row would need shrinking (1160 + gaps > 1100); Audio Capture over Transcript | Resources fits at defaults.
    const view = { width: 1100, height: 700 }
    const [r, t, res] = layoutGroup(capture, view)
    // Audio Capture keeps its own 380 in the 420 column it shares with Transcript.
    expect([r!.width, t!.width, res!.width]).toEqual([380, 420, 360])
    expect(t!.x).toBe(r!.x)
    expect(res!.x).toBe(t!.x + t!.width + 20)
    expectTidy([r!, t!, res!], view)
  })

  it('keeps "Plan my time" near its default widths: Calendar | To-do over Coming up, not a squeezed row', () => {
    const calendar = { width: 900, height: 760, minWidth: 520, minHeight: 420 }
    const todo = { width: 360, height: 440, minWidth: 280, minHeight: 220 }
    const comingUp = { width: 360, height: 320, minWidth: 260, minHeight: 200 }
    // 1280 wide: the row would squeeze the Calendar to 615; two columns keep it at 866.
    const [cal, td, cu] = layoutGroup([calendar, todo, comingUp], { width: 1280, height: 670 })
    expect(cal!.width).toBe(866)
    expect(cu!.x).toBe(td!.x)
    expect(td!.x).toBe(cal!.x + cal!.width + 20)
  })

  it('shrinks the row towards minimum widths, by the same fraction for each, when columns would not fit the view', () => {
    // Stacked, two of these need 2 x 400 + gaps of height: more than the view. The row fits it, shrunk.
    const tall = { width: 600, height: 500, minWidth: 300, minHeight: 400 }
    const view = { width: 1400, height: 700 }
    const boxes = layoutGroup([tall, tall, tall], view)
    // 1400 - 4 gaps = 1320 across; minimums 900, defaults 1800: 420 / 900 of the way.
    expect(boxes.map((b) => b.width)).toEqual([440, 440, 440])
    expect(boxes.map((b) => b.y)).toEqual([20, 20, 20])
    expectTidy(boxes, view)
  })

  it('goes to two columns when one row does not fit at minimum widths, keeping the order down then across', () => {
    // Minimums need 940 across in one row. Two columns: Audio Capture and Transcript on the left
    // (the split with the shorter tallest column), Resources on the right.
    const view = { width: 800, height: 700 }
    const [r, t, res] = layoutGroup(capture, view)
    expect(r!.x).toBe(t!.x)
    expect(t!.y).toBe(r!.y + r!.height + 20)
    expect(res!.x).toBe(t!.x + t!.width + 20)
    expect(res!.y).toBe(20)
    // The column is as wide as its widest member (Transcript, shrunk to 396); Audio Capture keeps its 380.
    expect(t!.width).toBe(396)
    expect(r!.width).toBe(380)
    // Heights fill the view, shared in proportion to default heights (280 : 380).
    expect(t!.y + t!.height).toBeGreaterThanOrEqual(679)
    expect(res!.height).toBe(660)
    expect(Math.abs(r!.height / t!.height - 280 / 380)).toBeLessThan(0.01)
    expectTidy([r!, t!, res!], view)
  })

  it('splits the "Plan my time" widgets as Calendar | To-do over Coming up when one row does not fit', () => {
    const calendar = { width: 900, height: 760, minWidth: 520, minHeight: 420 }
    const todo = { width: 360, height: 440, minWidth: 280, minHeight: 220 }
    const comingUp = { width: 360, height: 320, minWidth: 260, minHeight: 200 }
    const view = { width: 1024, height: 680 }
    const [cal, td, cu] = layoutGroup([calendar, todo, comingUp], view)
    expect(td!.x).toBe(cal!.x + cal!.width + 20)
    expect(cu!.x).toBe(td!.x)
    expect(cu!.y).toBe(td!.y + td!.height + 20)
    expectTidy([cal!, td!, cu!], view)
  })

  it('falls back to one column when two do not fit across', () => {
    const wide = { width: 500, height: 300, minWidth: 400, minHeight: 200 }
    const view = { width: 700, height: 900 }
    const boxes = layoutGroup([wide, wide], view)
    expect(boxes.map((b) => b.x)).toEqual([20, 20])
    expect(boxes.map((b) => b.width)).toEqual([500, 500])
    expectTidy(boxes, view)
  })

  it('lets the board scroll down when even the minimum heights do not fit the view, never across', () => {
    const view = { width: 800, height: 400 }
    const [r, t, res] = layoutGroup(capture, view)
    // The left column (min 200 + 250) can't fit 400: default heights, each capped to the view.
    expect(r!.height).toBe(280)
    expect(t!.height).toBe(360)
    expect(t!.y).toBe(r!.y + r!.height + 20)
    // The right column still fits and fills it.
    expect(res!.height).toBe(360)
    expectTidy([r!, t!, res!], view, { scrolls: true })
  })

  it('takes the scrollbar off the width when the layout scrolls', () => {
    // Too tall for the view: it scrolls, so the 900 wide widget gives up the scrollbar's 30.
    const wide = { width: 900, height: 300, minWidth: 600 }
    const view = { width: 960, height: 200 }
    expect(layoutGroup([wide], view)[0]!.width).toBe(900)
    expect(layoutGroup([wide], view, { scrollbarWidth: 30 })[0]!.width).toBe(890)
    // No scroll, no change.
    const roomy = { width: 1440, height: 800 }
    expect(layoutGroup(capture, roomy, { scrollbarWidth: 30 })).toEqual(layoutGroup(capture, roomy))
  })

  describe('in a window too short for any layout', () => {
    const calendar = { width: 900, height: 760, minWidth: 520, minHeight: 420 }
    const todo = { width: 360, height: 440, minWidth: 280, minHeight: 220 }
    const comingUp = { width: 360, height: 320, minWidth: 260, minHeight: 200 }

    it('picks the layout that runs past the view least, not one long column', () => {
      // 1280x327: only the Calendar's minimum (420) runs past the view; columns or one column would run further.
      const view = { width: 1280, height: 327 }
      const [cal, td, cu] = layoutGroup([calendar, todo, comingUp], view)
      expect([cal!.y, td!.y, cu!.y]).toEqual([20, 20, 20])
      expect(cal!.height).toBe(420)
      // The others fit the view, capped to it.
      expect(td!.y + td!.height).toBeLessThanOrEqual(view.height - 20)
      expect(cu!.y + cu!.height).toBeLessThanOrEqual(view.height - 20)
      expectTidy([cal!, td!, cu!], view, { scrolls: true })
    })

    it('runs the shortest column past the view when the row does not fit across', () => {
      // 640x300: no row at minimum widths (940). Audio Capture over Transcript | Resources runs
      // 210 past the view; Audio Capture | Transcript over Resources 250, one column 470.
      const view = { width: 640, height: 300 }
      const [r, t, res] = layoutGroup(capture, view)
      expect(t!.x).toBe(r!.x)
      expect(t!.y).toBeGreaterThan(r!.y + r!.height)
      expect(res!.x).toBe(t!.x + t!.width + 20)
      expect(res!.y).toBe(20)
      expectTidy([r!, t!, res!], view, { scrolls: true })
    })
  })

  it('never stretches a widget past its default width to match its column', () => {
    // A tall portrait board: one column of all three wins (nothing shrinks in width), with To-do
    // and Coming up at their own 360 under the 900 Calendar, at the column's left edge.
    const calendar = { width: 900, height: 760, minWidth: 520, minHeight: 420 }
    const todo = { width: 360, height: 440, minWidth: 280, minHeight: 220 }
    const comingUp = { width: 360, height: 320, minWidth: 260, minHeight: 200 }
    const view = { width: 1024, height: 1310 }
    const boxes = layoutGroup([calendar, todo, comingUp], view)
    expect(boxes.map((b) => b.x)).toEqual([20, 20, 20])
    expect(boxes.map((b) => b.width)).toEqual([900, 360, 360])
    expectTidy(boxes, view)
  })

  it('keeps heights within max constraints and widths within a member max', () => {
    const capped = { width: 300, height: 300, minWidth: 200, minHeight: 200, maxHeight: 400 }
    const boxes = layoutGroup([capped, { width: 300, height: 300, minHeight: 200 }], { width: 1200, height: 900 })
    expect(boxes[0]!.height).toBe(400)
    expect(boxes[1]!.height).toBe(860)
    // In a column with a wider widget, a widget with a smaller max width stops at it.
    const narrow = { width: 200, height: 300, minHeight: 200, maxWidth: 200 }
    const column = layoutGroup([{ width: 600, height: 300, minWidth: 600 }, narrow], { width: 700, height: 900 })
    expect(column.map((b) => b.width)).toEqual([600, 200])
  })

  it('holds a widget at its minimum height when its share falls under it, sharing the rest', () => {
    // One column; a small default next to a big one would get under its minimum in proportion.
    const big = { width: 600, height: 1000, minWidth: 600, minHeight: 100 }
    const small = { width: 600, height: 100, minWidth: 600, minHeight: 90 }
    const boxes = layoutGroup([big, small], { width: 700, height: 700 })
    expect(boxes[1]!.height).toBe(90)
    expect(boxes[0]!.height).toBe(700 - 3 * 20 - 90)
  })

  it('stacks the widgets in the order given, at default sizes, on a narrow canvas', () => {
    const boxes = layoutGroup(capture, { width: STACK_BREAKPOINT - 1, height: 800 })
    expect(boxes).toEqual([
      { x: 20, y: 20, width: 380, height: 280 },
      { x: 20, y: 320, width: 420, height: 380 },
      { x: 20, y: 720, width: 360, height: 440 },
    ])
  })

  it('lays out nothing for no widgets', () => {
    expect(layoutGroup([], { width: 1200, height: 800 })).toEqual([])
  })
})
