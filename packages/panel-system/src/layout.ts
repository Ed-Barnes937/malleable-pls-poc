import { DEFAULT_SIZE_CONSTRAINTS, clampDimensions, type PanelItem, type PanelLayout } from './canvas-store'
import { PLACEMENT_GAP } from './geometry'
import { GRID_SIZE, snapToGrid } from './snap'

/**
 * The canvas's layout rules (flow audit proposal 5, decisions 18 and 26):
 * placement is free and widgets may overlap, but holding Shift snaps the
 * widget to the grid and nudges anything it would cover to the nearest free
 * spot (`shiftLanding`), and Tidy up fills the view (`tidyLayout`).
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const G = PLACEMENT_GAP

export const boxOf = (p: Pick<PanelItem, 'pos_x' | 'pos_y' | 'width' | 'height'>): Box => ({ x: p.pos_x, y: p.pos_y, width: p.width, height: p.height })

/** The two boxes overlap (touching edges don't). */
export function overlaps(a: Box, b: Box): boolean {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
    && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
}

/** `a` comes closer to `b` than `gap` (or overlaps it). */
function crowds(a: Box, b: Box, gap: number): boolean {
  return Math.min(a.x + a.width + gap, b.x + b.width) > Math.max(a.x - gap, b.x)
    && Math.min(a.y + a.height + gap, b.y + b.height) > Math.max(a.y - gap, b.y)
}

/** The visible part of the canvas: its width, and the rows from `top` (its scroll) down `height`. */
export interface CanvasView {
  width: number
  height: number
  top?: number
}

/**
 * Where a widget being dragged with Shift held lands: on the grid, and wholly
 * on the canvas from side to side and below its top edge.
 */
export function snapMove(box: Box, canvasWidth: number): Box {
  const maxX = Math.max(0, canvasWidth - box.width)
  return {
    ...box,
    x: Math.min(Math.max(0, snapToGrid(box.x)), maxX),
    y: Math.max(0, snapToGrid(box.y)),
  }
}

/**
 * The box a widget being resized with Shift held takes: each edge on the
 * grid, never past the canvas's sides or top, and no smaller than the
 * widget's minimum (grown from the edges that aren't held still).
 */
export function snapResize(
  box: Box,
  axes: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 },
  constraints: PanelItem['constraints'],
  canvasWidth: number,
): Box {
  const left = Math.max(0, snapToGrid(box.x))
  const top = Math.max(0, snapToGrid(box.y))
  const right = Math.min(Math.max(snapToGrid(box.x + box.width), left), Math.max(canvasWidth, left))
  const bottom = snapToGrid(box.y + box.height)
  const size = clampDimensions(right - left, bottom - top, constraints)
  return {
    x: axes.dx === -1 ? right - size.width : left,
    y: axes.dy === -1 ? bottom - size.height : top,
    width: size.width,
    height: size.height,
  }
}

/**
 * The nearest spot (by its top-left, on the grid) for `box` in the view that
 * keeps `PLACEMENT_GAP` from everything in `taken` and from the canvas's
 * edges; null when the view has none.
 */
export function nearestFreeSpot(box: Box, taken: ReadonlyArray<Box>, view: CanvasView): Box | null {
  const top = view.top ?? 0
  let best: Box | null = null
  let bestDistance = Infinity
  const firstY = Math.ceil((top + G) / GRID_SIZE) * GRID_SIZE
  for (let y = firstY; y + box.height + G <= top + view.height; y += GRID_SIZE) {
    for (let x = G; x + box.width + G <= view.width; x += GRID_SIZE) {
      const spot = { ...box, x, y }
      if (taken.some((t) => crowds(spot, t, G))) continue
      const distance = Math.hypot(x - box.x, y - box.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = spot
      }
    }
  }
  return best
}

/**
 * Where everything lands when the widget `movingId` is dropped (or resized)
 * at `box` with Shift held: it stays there, and every widget it covers is
 * nudged to the nearest free spot in view (in reading order, each clear of
 * the ones nudged before it). When the view has no free spot, a nudged
 * widget goes below the lowest widget, keeping its place across, and the
 * canvas grows to fit it. Returns the new top-left of each nudged widget.
 */
export function nudgeCovered(
  movingId: string,
  box: Box,
  panels: ReadonlyArray<PanelItem>,
  view: CanvasView,
): Map<string, { x: number; y: number }> {
  const others = panels.filter((p) => p.id !== movingId)
  const covered = others.filter((p) => overlaps(boxOf(p), box)).sort(byReadingOrder)
  const coveredIds = new Set(covered.map((p) => p.id))
  const taken: Box[] = [box, ...others.filter((p) => !coveredIds.has(p.id)).map(boxOf)]
  const moves = new Map<string, { x: number; y: number }>()
  for (const p of covered) {
    const own = boxOf(p)
    const spot = nearestFreeSpot(own, taken, view) ?? {
      ...own,
      x: Math.min(Math.max(0, own.x), Math.max(0, view.width - own.width)),
      y: Math.max(...taken.map((t) => t.y + t.height)) + G,
    }
    taken.push(spot)
    moves.set(p.id, { x: spot.x, y: spot.y })
  }
  return moves
}

/** Top to bottom, then left to right. */
export function byReadingOrder(a: Pick<PanelItem, 'pos_x' | 'pos_y'>, b: Pick<PanelItem, 'pos_x' | 'pos_y'>): number {
  return a.pos_y - b.pos_y || a.pos_x - b.pos_x
}

/* ── Tidy up ── */

const minW = (p: PanelItem) => p.constraints?.minWidth ?? DEFAULT_SIZE_CONSTRAINTS.minWidth
const minH = (p: PanelItem) => p.constraints?.minHeight ?? DEFAULT_SIZE_CONSTRAINTS.minHeight

/** A column's widgets may shrink to this share of their own heights to fit it. */
const MIN_SHRINK = 0.75

/**
 * Tidy up: the widgets fill the view (`canvas`, the board's `main` area)
 * without overlapping. The Calendar (else the largest widget) leads, in a
 * column of its own on the left at the view's full height, keeping its own
 * width where the others still fit beside it. The others follow in reading
 * order, in as few columns as keep each widget's own height (or shrink it by
 * a quarter at most, never below its minimum); the columns share the width
 * that is left, and the last widget in each reaches the bottom. Only when
 * the widgets' minimums can't fit side by side do they go one under another
 * at full width, and the board scrolls rather than anything overlapping.
 */
export function tidyLayout(panels: ReadonlyArray<PanelItem>, canvas: { width: number; height: number }): Map<string, PanelLayout & { z_index: number }> {
  const out = new Map<string, PanelLayout & { z_index: number }>()
  if (panels.length === 0) return out
  const fullW = canvas.width - 2 * G
  const fullH = canvas.height - 2 * G
  const lead = panels.find((p) => p.lensType === 'calendar')
    ?? [...panels].sort((a, b) => b.width * b.height - a.width * a.height || byReadingOrder(a, b))[0]!
  const rest = panels.filter((p) => p.id !== lead.id).sort(byReadingOrder)
  const put = (p: PanelItem, x: number, y: number, width: number, height: number) => {
    const size = clampDimensions(width, height, p.constraints)
    out.set(p.id, { pos_x: Math.round(x), pos_y: Math.round(y), width: Math.round(size.width), height: Math.round(size.height), z_index: out.size + 1 })
  }

  if (rest.length === 0) {
    put(lead, G, G, fullW, fullH)
    return out
  }

  const fits = (column: PanelItem[]) => {
    const gaps = G * (column.length - 1)
    const own = column.reduce((s, p) => s + p.height, 0)
    if (own + gaps <= fullH) return true
    return (fullH - gaps) / own >= MIN_SHRINK && column.reduce((s, p) => s + minH(p), 0) + gaps <= fullH
  }
  // Room for the columns beside a lead of `leadW`, and the least they need.
  const roomBeside = (leadW: number, count: number) => fullW - leadW - G * count
  const columnsMin = (columns: PanelItem[][]) => columns.reduce((s, c) => s + Math.max(...c.map(minW)), 0)

  let count = 1
  while (count < rest.length && !chunk(rest, count).every(fits)) count++
  while (count > 1 && roomBeside(minW(lead), count) < columnsMin(chunk(rest, count))) count--
  const columns = chunk(rest, count)

  if (roomBeside(minW(lead), count) < columnsMin(columns)) {
    // Too narrow for side by side: one under another, each at its own height.
    let y = G
    for (const p of [lead, ...rest]) {
      const height = Math.max(minH(p), Math.min(p.height, fullH))
      put(p, G, y, fullW, height)
      y += height + G
    }
    return out
  }

  const leadW = Math.max(minW(lead), Math.min(lead.width, fullW - G * count - columnsMin(columns)))
  put(lead, G, G, leadW, fullH)

  // The columns share what is left in proportion to their widest widget,
  // each given its minimum first.
  const room = roomBeside(leadW, count)
  const mins = columns.map((c) => Math.max(...c.map(minW)))
  const wants = columns.map((c, i) => Math.max(mins[i]!, ...c.map((p) => p.width)))
  const spare = room - mins.reduce((s, m) => s + m, 0)
  const extra = wants.reduce((s, w, i) => s + w - mins[i]!, 0)
  let x = G + leadW + G
  columns.forEach((column, ci) => {
    const share = extra > 0 ? (wants[ci]! - mins[ci]!) / extra : 1 / columns.length
    const width = ci === columns.length - 1 ? fullW + G - x : Math.floor(mins[ci]! + spare * share)
    const gaps = G * (column.length - 1)
    const own = column.reduce((s, p) => s + p.height, 0)
    const scale = own + gaps > fullH ? (fullH - gaps) / own : 1
    let y = G
    column.forEach((p, i) => {
      const last = i === column.length - 1
      const height = last ? Math.max(minH(p), G + fullH - y) : Math.max(minH(p), Math.floor(p.height * scale))
      put(p, x, y, width, height)
      y += height + G
    })
    x += width + G
  })
  return out
}

/** Splits `items`, in order, into `n` runs as near equal in length as can be. */
function chunk<T>(items: ReadonlyArray<T>, n: number): T[][] {
  const out: T[][] = []
  let start = 0
  for (let i = 0; i < n; i++) {
    const end = start + Math.ceil((items.length - start) / (n - i))
    if (end > start) out.push(items.slice(start, end))
    start = end
  }
  return out
}
