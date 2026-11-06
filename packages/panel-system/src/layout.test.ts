import { describe, it, expect } from 'vitest'
import type { PanelItem } from './canvas-store'
import { PLACEMENT_GAP as G } from './geometry'
import { boxOf, nearestFreeSpot, nudgeCovered, overlaps, snapMove, snapResize, tidyLayout, type Box } from './layout'

function panel(id: string, x: number, y: number, width: number, height: number, extra: Partial<PanelItem> = {}): PanelItem {
  return { id, pos_x: x, pos_y: y, width, height, z_index: 1, ...extra }
}

const calendar = (x = 20, y = 20, w = 900, h = 760) =>
  panel('cal', x, y, w, h, { lensType: 'calendar', constraints: { minWidth: 520, minHeight: 420 } })
const todo = (x = 940, y = 20, w = 360, h = 440) =>
  panel('todo', x, y, w, h, { lensType: 'todo', constraints: { minWidth: 280, minHeight: 220 } })
const comingUp = (x = 940, y = 480, w = 360, h = 320) =>
  panel('up', x, y, w, h, { lensType: 'coming-up', constraints: { minWidth: 260, minHeight: 200 } })

/** The `main` area at 1440x900: the window less the top bar. */
const VIEW = { width: 1440, height: 836 }

function applied(panels: PanelItem[], layout: ReturnType<typeof tidyLayout>): PanelItem[] {
  return panels.map((p) => ({ ...p, ...layout.get(p.id) }))
}

function expectNoOverlaps(boxes: Box[]) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `${i} and ${j} overlap`).toBe(false)
  }
}

describe('snapMove', () => {
  it('snaps to the grid and keeps the widget on the canvas across and below its top', () => {
    expect(snapMove({ x: 33, y: 47, width: 300, height: 200 }, 1000)).toEqual({ x: 40, y: 40, width: 300, height: 200 })
    expect(snapMove({ x: -45, y: -30, width: 300, height: 200 }, 1000)).toMatchObject({ x: 0, y: 0 })
    expect(snapMove({ x: 905, y: 20, width: 300, height: 200 }, 1000)).toMatchObject({ x: 700 })
  })
})

describe('snapResize', () => {
  it('puts every edge on the grid', () => {
    expect(snapResize({ x: 21, y: 19, width: 413, height: 307 }, { dx: 1, dy: 1 }, undefined, 1400))
      .toEqual({ x: 20, y: 20, width: 420, height: 300 })
  })

  it('never shrinks below the minimum, growing away from the edge held still', () => {
    // The right edge (held still) snaps to 560; the left goes out to keep the minimum.
    const box = snapResize({ x: 400, y: 100, width: 150, height: 300 }, { dx: -1, dy: 0 }, { minWidth: 280 }, 1400)
    expect(box).toEqual({ x: 280, y: 100, width: 280, height: 300 })
  })

  it('stops at the canvas edge', () => {
    expect(snapResize({ x: 1000, y: 20, width: 500, height: 300 }, { dx: 1, dy: 0 }, undefined, 1400)).toMatchObject({ x: 1000, width: 400 })
  })
})

describe('nearestFreeSpot', () => {
  it('is the closest spot on the grid clear of everything by the gap', () => {
    const spot = nearestFreeSpot({ x: 100, y: 100, width: 200, height: 200 }, [{ x: 0, y: 0, width: 400, height: 400 }], { width: 1000, height: 600 })
    expect(spot).toEqual({ x: 420, y: 100, width: 200, height: 200 })
  })

  it('is null when the view has no room', () => {
    expect(nearestFreeSpot({ x: 0, y: 0, width: 300, height: 300 }, [{ x: 0, y: 0, width: 1000, height: 600 }], { width: 1000, height: 600 })).toBeNull()
  })

  it('looks only at the rows in view', () => {
    const spot = nearestFreeSpot({ x: 20, y: 20, width: 200, height: 200 }, [], { width: 1000, height: 600, top: 500 })
    expect(spot?.y).toBeGreaterThanOrEqual(520)
    expect(spot!.y + 200).toBeLessThanOrEqual(1100)
  })
})

describe('nudgeCovered', () => {
  it('moves only what the dropped widget covers, to the nearest free spot', () => {
    const panels = [calendar(), todo(), comingUp()]
    // To-do dropped over the top of Coming up.
    const box = { x: 940, y: 400, width: 360, height: 300 }
    const moves = nudgeCovered('todo', box, panels, VIEW)
    expect([...moves.keys()]).toEqual(['up'])
    const up = { ...boxOf(comingUp()), ...moves.get('up')! }
    expect(overlaps(up, box)).toBe(false)
    expect(overlaps(up, boxOf(calendar()))).toBe(false)
    expect(up.y + up.height).toBeLessThanOrEqual(VIEW.height)
  })

  it('leaves a widget the drop only comes near', () => {
    const moves = nudgeCovered('todo', { x: 940, y: 20, width: 360, height: 450 }, [calendar(), todo(), comingUp()], VIEW)
    expect(moves.size).toBe(0)
  })

  it('puts a neighbour below the lowest widget, at its place across, when nothing in view is free', () => {
    // The Calendar fills the left of the view; the To-do is dropped over the
    // whole right of it, Coming up included.
    const panels = [calendar(20, 20, 900, 796), todo(), comingUp()]
    const box = { x: 940, y: 20, width: 480, height: 796 }
    const moves = nudgeCovered('todo', box, panels, VIEW)
    expect([...moves]).toEqual([['up', { x: 940, y: 816 + G }]])
  })

  it('finds the free spot in the part of the board scrolled into view', () => {
    const panels = [todo(20, 1000), comingUp(20, 1100)]
    const box = { x: 20, y: 1000, width: 360, height: 440 }
    const moves = nudgeCovered('todo', box, panels, { ...VIEW, top: 800 })
    const up = moves.get('up')!
    expect(up.y).toBeGreaterThanOrEqual(800)
    expect(up.y + 320).toBeLessThanOrEqual(800 + VIEW.height)
  })

  it('never lands two nudged widgets on each other', () => {
    const a = panel('a', 100, 100, 300, 200)
    const b = panel('b', 150, 150, 300, 200)
    const box = { x: 100, y: 100, width: 400, height: 300 }
    const moves = nudgeCovered('m', box, [a, b, panel('m', 600, 600, 400, 300)], { width: 1200, height: 800 })
    const placed = [box, { ...boxOf(a), ...moves.get('a')! }, { ...boxOf(b), ...moves.get('b')! }]
    expectNoOverlaps(placed)
  })
})

describe('tidyLayout', () => {
  it('fills the view with the Calendar leading, keeping its width, and the rest beside it', () => {
    // A messy board: everything overlapping.
    const panels = [todo(200, 300), calendar(400, 100), comingUp(100, 100)]
    const out = applied(panels, tidyLayout(panels, VIEW))
    const [t, c, u] = out
    expect(c).toMatchObject({ pos_x: G, pos_y: G, width: 900, height: VIEW.height - 2 * G, z_index: 1 })
    // Reading order beside it: Coming up (higher up) first, then To-do, one column.
    expect(u).toMatchObject({ pos_x: 940, pos_y: G, width: VIEW.width - G - 940, height: 320 })
    expect(t).toMatchObject({ width: VIEW.width - G - 940 })
    expect(t).toMatchObject({ pos_x: 940, pos_y: G + 320 + G })
    // The last reaches the bottom.
    expect(t!.pos_y + t!.height).toBe(VIEW.height - G)
    expectNoOverlaps(out.map(boxOf))
  })

  it('leads with the largest widget when there is no Calendar', () => {
    const big = panel('big', 600, 400, 700, 500)
    const panels = [todo(20, 20), big, comingUp(20, 480)]
    const out = tidyLayout(panels, VIEW)
    expect(out.get('big')).toMatchObject({ pos_x: G, pos_y: G, width: 700 })
  })

  it('fills the view with a lone widget', () => {
    expect(tidyLayout([todo()], VIEW).get('todo')).toEqual({ pos_x: G, pos_y: G, width: VIEW.width - 2 * G, height: VIEW.height - 2 * G, z_index: 1 })
  })

  it('makes more columns rather than squashing widgets, and nothing leaves the view', () => {
    const panels = [calendar(), ...['a', 'b', 'c', 'd', 'e'].map((id, i) => panel(id, 940, 20 + i * 100, 300, 360))]
    const out = applied(panels, tidyLayout(panels, VIEW))
    expectNoOverlaps(out.map(boxOf))
    for (const p of out) {
      expect(p.pos_x + p.width).toBeLessThanOrEqual(VIEW.width - G)
      expect(p.pos_y + p.height).toBeLessThanOrEqual(VIEW.height - G)
    }
    // Two of the 360-tall widgets fit in a column (360 + 20 + 360 = 740): three columns.
    expect(new Set(out.filter((p) => p.id !== 'cal').map((p) => p.pos_x)).size).toBe(3)
    // The Calendar gives up width so the columns get their minimum.
    expect(out[0]!.width).toBeLessThan(900)
    expect(out[0]!.width).toBeGreaterThanOrEqual(520)
  })

  it('keeps a widget at its own height where its column has room', () => {
    const panels = [calendar(), todo(940, 20, 360, 300), comingUp(940, 400, 360, 200)]
    const out = tidyLayout(panels, VIEW)
    expect(out.get('todo')!.height).toBe(300)
  })

  it('never shrinks a widget below its minimum', () => {
    const panels = [calendar(), ...['a', 'b', 'c'].map((id, i) => panel(id, 940, i * 10, 300, 900, { constraints: { minWidth: 280, minHeight: 600 } }))]
    for (const [id, to] of tidyLayout(panels, VIEW)) {
      if (id !== 'cal') expect(to.height).toBeGreaterThanOrEqual(600)
    }
  })

  it('stacks the widgets at full width when they cannot sit side by side', () => {
    const narrow = { width: 700, height: 600 }
    const panels = [calendar(), todo(), comingUp()]
    const out = applied(panels, tidyLayout(panels, narrow))
    expectNoOverlaps(out.map(boxOf))
    expect(out.every((p) => p.pos_x === G && p.width === narrow.width - 2 * G)).toBe(true)
    expect(out.find((p) => p.id === 'cal')!.pos_y).toBe(G)
  })

  it('never overlaps, whatever the board', () => {
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let run = 0; run < 200; run++) {
      const count = 1 + Math.floor(random() * 8)
      const panels = Array.from({ length: count }, (_, i) =>
        panel(`p${i}`, random() * 1000, random() * 800, 200 + random() * 700, 150 + random() * 700, { lensType: i === 0 && random() > 0.5 ? 'calendar' : undefined }))
      const view = { width: 640 + random() * 1300, height: 400 + random() * 700 }
      const out = applied(panels, tidyLayout(panels, view))
      expectNoOverlaps(out.map(boxOf))
      for (const p of out) {
        expect(p.pos_x).toBeGreaterThanOrEqual(0)
        expect(p.pos_x + p.width).toBeLessThanOrEqual(view.width)
      }
    }
  })
})
