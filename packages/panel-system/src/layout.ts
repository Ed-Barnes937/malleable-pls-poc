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

/** The last grid line at or before `v`. */
const gridFloor = (v: number) => Math.floor(v / GRID_SIZE) * GRID_SIZE

/**
 * Where a widget being dragged with Shift held lands: on the grid, and wholly
 * on the canvas from side to side and below its top, keeping the gap from
 * its edges that nudges and Tidy up keep.
 */
export function snapMove(box: Box, canvasWidth: number): Box {
  const maxX = Math.max(G, gridFloor(canvasWidth - G - box.width))
  return {
    ...box,
    x: Math.min(Math.max(G, snapToGrid(box.x)), maxX),
    y: Math.max(G, snapToGrid(box.y)),
  }
}

/**
 * The box a widget being resized with Shift held takes: each edge on the
 * grid, the gap's width clear of the canvas's sides and top, and no smaller
 * than the widget's minimum (grown from the edges that aren't held still).
 */
export function snapResize(
  box: Box,
  axes: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 },
  constraints: PanelItem['constraints'],
  canvasWidth: number,
): Box {
  const left = Math.max(G, snapToGrid(box.x))
  const top = Math.max(G, snapToGrid(box.y))
  const right = Math.min(Math.max(snapToGrid(box.x + box.width), left), Math.max(gridFloor(canvasWidth - G), left))
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
 * widget goes below the lowest widget, on the grid and keeping its place
 * across, and the canvas grows to fit it. Returns the new top-left of each nudged widget.
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
      x: Math.min(Math.max(G, snapToGrid(own.x)), Math.max(G, gridFloor(view.width - G - own.width))),
      y: Math.ceil((Math.max(...taken.map((t) => t.y + t.height)) + G) / GRID_SIZE) * GRID_SIZE,
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
 * A side column narrower than this share of its own width is squeezed (its
 * titles truncate), as is one whose widgets must shrink past `MIN_SHRINK`:
 * Tidy up would rather move a widget under the lead.
 */
const SQUEEZE = 0.85

type Placed = PanelLayout & { z_index: number }

/** Something sharing a row's width: the width it would like, and the least it can take. */
interface WidthWant { want: number; min: number }

/**
 * Splits `room` across `items`: spare room in proportion to what each wants
 * (so nothing ends up oversized), or, short of room, taking it back in
 * proportion to how far each is above its minimum. The widths add up to
 * `room` exactly.
 */
export function shareWidth(room: number, items: ReadonlyArray<WidthWant>): number[] {
  const wanted = items.reduce((s, i) => s + i.want, 0)
  const raw = wanted <= room
    ? items.map((i) => i.want + (room - wanted) * (i.want / wanted))
    : (() => {
        const give = items.reduce((s, i) => s + i.want - i.min, 0)
        const short = wanted - room
        return items.map((i) => i.want - (give > 0 ? short * (i.want - i.min) / give : 0))
      })()
  const out = raw.map(Math.floor)
  out[out.length - 1]! += room - out.reduce((s, w) => s + w, 0)
  return out
}

/**
 * Tidy up: the widgets fill the view (`canvas`, the board's `main` area)
 * without overlapping. The Calendar (else the largest widget) leads, on the
 * left at the view's full height. The others follow in reading order, in as
 * few columns beside it as keep each widget's own height (or shrink it by a
 * quarter at most, never below its minimum), and the last widget in each
 * column reaches the bottom. The lead and the columns share the row's width
 * in proportion to their own widths, so none is oversized. When that would
 * squeeze a column well below its own width, the last widgets go in a row
 * under the lead instead. Only when the widgets' minimums can't fit side by
 * side do they go one under another at full width, and the board scrolls
 * rather than anything overlapping.
 */
export function tidyLayout(panels: ReadonlyArray<PanelItem>, canvas: { width: number; height: number }): Map<string, Placed> {
  if (panels.length === 0) return new Map()
  const fullW = canvas.width - 2 * G
  const fullH = canvas.height - 2 * G
  const lead = panels.find((p) => p.lensType === 'calendar')
    ?? [...panels].sort((a, b) => b.width * b.height - a.width * a.height || byReadingOrder(a, b))[0]!
  const rest = panels.filter((p) => p.id !== lead.id).sort(byReadingOrder)

  if (rest.length === 0) return placed([[lead, G, G, fullW, fullH]])

  // Fewest widgets under the lead that leave no column squeezed; failing
  // that, none under it.
  let fallback: Plan | null = null
  for (let under = 0; under < rest.length; under++) {
    const plan = planBeside(lead, rest.slice(0, rest.length - under), rest.slice(rest.length - under), fullW, fullH)
    if (!plan) continue
    if (!plan.squeezed) return placed(plan.boxes)
    fallback ??= plan
  }
  if (fallback) return placed(fallback.boxes)

  // Too narrow for side by side: one under another, each at its own height.
  let y = G
  return placed([lead, ...rest].map((p) => {
    const height = Math.max(minH(p), Math.min(p.height, fullH))
    const box: Box4 = [p, G, y, fullW, height]
    y += height + G
    return box
  }))
}

type Box4 = [PanelItem, number, number, number, number]
interface Plan { boxes: Box4[]; squeezed: boolean }

/**
 * The lead on the left with `under` in a row beneath it, and `side` in
 * columns beside it; null when their minimums don't fit.
 */
function planBeside(lead: PanelItem, side: PanelItem[], under: PanelItem[], fullW: number, fullH: number): Plan | null {
  // The row under the lead: as tall as its widgets (within what the lead can spare).
  const underH = under.length === 0 ? 0 : Math.max(...under.map(minH), Math.min(Math.max(...under.map((p) => p.height)), fullH - G - minH(lead)))
  const leadH = under.length === 0 ? fullH : fullH - G - underH
  if (leadH < minH(lead)) return null
  const underMinW = under.reduce((s, p) => s + minW(p), 0) + G * Math.max(0, under.length - 1)
  const leadMin = Math.max(minW(lead), underMinW)
  const leadWant = Math.max(leadMin, lead.width, under.reduce((s, p) => s + p.width, 0) + G * Math.max(0, under.length - 1))

  const fits = (column: PanelItem[]) => {
    const gaps = G * (column.length - 1)
    const own = column.reduce((s, p) => s + p.height, 0)
    if (own + gaps <= fullH) return true
    return (fullH - gaps) / own >= MIN_SHRINK && column.reduce((s, p) => s + minH(p), 0) + gaps <= fullH
  }
  const columnsMin = (columns: PanelItem[][]) => columns.reduce((s, c) => s + Math.max(...c.map(minW)), 0)
  const roomFor = (count: number) => fullW - G * count
  let count = 1
  while (count < side.length && !chunk(side, count).every(fits)) count++
  while (count > 1 && roomFor(count) - leadMin < columnsMin(chunk(side, count))) count--
  const columns = chunk(side, count)
  if (roomFor(count) - leadMin < columnsMin(columns)) return null

  const wants = columns.map((c) => {
    const min = Math.max(...c.map(minW))
    return { want: Math.max(min, ...c.map((p) => p.width)), min }
  })
  const [leadW, ...columnWs] = shareWidth(roomFor(count), [{ want: leadWant, min: leadMin }, ...wants])
  const boxes: Box4[] = [[lead, G, G, leadW!, leadH]]
  if (under.length > 0) {
    const widths = shareWidth(leadW! - G * (under.length - 1), under.map((p) => ({ want: Math.max(minW(p), p.width), min: minW(p) })))
    let x = G
    under.forEach((p, i) => {
      boxes.push([p, x, G + leadH + G, widths[i]!, underH])
      x += widths[i]! + G
    })
  }
  let x = G + leadW! + G
  columns.forEach((column, ci) => {
    const width = columnWs[ci]!
    const gaps = G * (column.length - 1)
    const own = column.reduce((s, p) => s + p.height, 0)
    const scale = own + gaps > fullH ? (fullH - gaps) / own : 1
    let y = G
    column.forEach((p, i) => {
      const last = i === column.length - 1
      const height = last ? Math.max(minH(p), G + fullH - y) : Math.max(minH(p), Math.floor(p.height * scale))
      boxes.push([p, x, y, width, height])
      y += height + G
    })
    x += width + G
  })
  // Squeezed: a column well below its own width, or its widgets shrunk past what `fits` allows.
  const squeezed = columnWs.some((w, i) => w < wants[i]!.want * SQUEEZE) || !columns.every(fits)
  return { boxes, squeezed }
}

/** The layout for each box, stacked in the order given. */
function placed(boxes: ReadonlyArray<Box4>): Map<string, Placed> {
  const out = new Map<string, Placed>()
  for (const [p, x, y, width, height] of boxes) {
    const size = clampDimensions(width, height, p.constraints)
    out.set(p.id, { pos_x: Math.round(x), pos_y: Math.round(y), width: Math.round(size.width), height: Math.round(size.height), z_index: out.size + 1 })
  }
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
