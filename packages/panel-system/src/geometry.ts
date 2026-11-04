type Axes = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }

/**
 * Clamp a panel's absolute position so at least `visible` pixels remain on-screen.
 * visible = min(100, panelWidth/2, panelHeight/2) — same formula as both CanvasEngine drag handlers.
 */
export function clampToCanvas(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  canvas: { width: number; height: number },
): { x: number; y: number } {
  const visible = Math.min(100, size.width / 2, size.height / 2)
  return {
    x: Math.max(visible - size.width, Math.min(pos.x, canvas.width - visible)),
    y: Math.max(0, Math.min(pos.y, canvas.height - visible)),
  }
}

/**
 * Compute unclamped new panel dimensions from a resize gesture.
 * axes.dx/dy: -1 shrinks on that edge, 0 = no change, 1 grows.
 */
export function resizeDimensions(
  start: { w: number; h: number },
  axes: Axes,
  delta: { x: number; y: number },
): { w: number; h: number } {
  return {
    w: axes.dx !== 0 ? start.w + axes.dx * delta.x : start.w,
    h: axes.dy !== 0 ? start.h + axes.dy * delta.y : start.h,
  }
}

/**
 * Compute the panel's top-left after anchoring during resize.
 * When dragging a W/NW/N handle the opposite corner must stay fixed —
 * the origin shifts by the change in size. Pass already-clamped dimensions.
 */
export function anchoredPosition(
  start: { x: number; y: number; w: number; h: number },
  axes: Axes,
  newW: number,
  newH: number,
): { x: number; y: number } {
  return {
    x: axes.dx === -1 ? start.x + start.w - newW : start.x,
    y: axes.dy === -1 ? start.y + start.h - newH : start.y,
  }
}

type Rect = { x: number; y: number; width: number; height: number }

/** Gap kept between a newly placed panel, its neighbours and the canvas edge. */
export const PLACEMENT_GAP = 20

/**
 * Top-left for a new panel of `size`: the first spot, scanning rows top to
 * bottom and left to right, where it fits inside the canvas without touching
 * any existing panel (keeping `PLACEMENT_GAP` around it). When the canvas has
 * no such spot, the scan carries on below it, so a full board grows downward
 * (the canvas scrolls) and the new panel never covers another one: at the
 * latest, a row of its own under the lowest panel.
 */
export function findFreeSpot(
  panels: Rect[],
  size: { width: number; height: number },
  canvas: { width: number; height: number },
  step = PLACEMENT_GAP,
): { x: number; y: number } {
  const g = PLACEMENT_GAP
  const touches = (x: number, y: number) =>
    panels.some((p) =>
      Math.min(x + size.width + g, p.x + p.width) > Math.max(x - g, p.x)
      && Math.min(y + size.height + g, p.y + p.height) > Math.max(y - g, p.y))

  const bottom = Math.max(0, ...panels.map((p) => p.y + p.height))
  const height = panels.length > 0 ? Math.max(canvas.height, bottom + 2 * g + size.height) : canvas.height
  const xs = positions(canvas.width - size.width, g, step)
  for (const y of positions(height - size.height, g, step)) {
    for (const x of xs) {
      if (!touches(x, y)) return { x, y }
    }
  }
  // The scan steps past the exact row under the lowest panel; that row is always free.
  if (panels.length > 0) return { x: xs[0]!, y: bottom + g }
  return { x: xs[0]!, y: positions(canvas.height - size.height, g, step)[0]! }
}

/** Below this canvas width, panels stack in one scrolling column instead of floating. */
export const STACK_BREAKPOINT = 640

/**
 * Spot and height for a widget added with a click, so it lands fully in view
 * whenever it can: at its default size where that fits on the canvas
 * (`findFreeSpot`); else, where it fits at no less than `minHeight`, as tall
 * as the room there allows (up to its default). Only when neither fits does
 * it go below the fold at its default size, as `findFreeSpot` does. Shrinking
 * it rather than scrolling the board to it keeps the widgets already in view
 * where they are (e.g. a Calendar the height of the view keeps its header).
 *
 * The height is saved, so it is only shortened where that is about the other
 * widgets rather than this screen: on the free (desktop) layout, next to
 * widgets already on the board. On an empty board, or a narrow canvas (where
 * the widgets stack and the board scrolls anyway), it keeps its default
 * height, so a board built on a phone or short laptop is not stuck with it.
 */
export function placeNewPanel(
  panels: Rect[],
  size: { width: number; height: number; minHeight?: number },
  canvas: { width: number; height: number },
): { x: number; y: number; height: number } {
  const g = PLACEMENT_GAP
  const spot = findFreeSpot(panels, size, canvas)
  const inView = (y: number, height: number) => y + height <= canvas.height
  if (inView(spot.y, size.height)) return { ...spot, height: size.height }
  if (panels.length === 0 || canvas.width < STACK_BREAKPOINT) return { ...spot, height: size.height }
  const minHeight = Math.min(size.height, size.minHeight ?? size.height)
  if (minHeight < size.height) {
    const low = findFreeSpot(panels, { width: size.width, height: minHeight }, canvas)
    if (inView(low.y, minHeight)) {
      // Down to the next widget below it, or the bottom of the view.
      const below = panels
        .filter((p) => p.y >= low.y + minHeight && Math.min(low.x + size.width + g, p.x + p.width) > Math.max(low.x - g, p.x))
        .map((p) => p.y - g)
      const room = Math.min(canvas.height - g, ...below) - low.y
      return { ...low, height: Math.max(minHeight, Math.min(size.height, Math.floor(room))) }
    }
  }
  return { ...spot, height: size.height }
}

/** Candidate offsets along one axis with `room` to spare, keeping `gap` from both edges where it fits. */
function positions(room: number, gap: number, step: number): number[] {
  if (room - gap < gap) return [Math.max(0, Math.min(gap, room))]
  const out: number[] = []
  for (let v = gap; v <= room - gap; v += step) out.push(v)
  return out
}

/** A widget's size and size constraints, as its manifest gives them. */
export interface GroupMember {
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

/**
 * Boxes for a group of widgets added together to an empty board (a starter),
 * in the order given (workflow order), laid out to fit the visible canvas:
 *
 * - Columns, filled in order: the first widgets go in the first column, top
 *   to bottom, then the next column; one column per widget is one row. For
 *   each column count, the split (of those that fit across at minimum widths)
 *   whose tallest column is shortest at default heights; a tie goes to the
 *   first.
 * - Widths shrink from default towards minimum, by the same fraction in every
 *   column, until the columns fit across. A column is as wide as its widest
 *   member (a member with a smaller `maxWidth` stops there).
 * - The column count is the one that keeps widgets closest to their designed
 *   widths: least shrunk, by the widget shrunk most (as a share of its
 *   default width). Ties go to the row (more columns), so widgets that fit
 *   side by side at their default widths stay in one row. A count whose
 *   minimum heights don't fit the view only wins when none does.
 * - Heights fill the visible height: a column's height is shared in
 *   proportion to its widgets' default heights, within their min and max.
 *   A column whose minimum heights don't fit stacks at default heights
 *   (each capped to the view where its minimum allows) and the board scrolls
 *   down. Never wider than the canvas while the minimum widths allow.
 *
 * When the layout scrolls, `scrollbarWidth` is taken off the canvas width
 * (the scrollbar it brings would otherwise push the last column under it).
 * A narrow canvas (under `STACK_BREAKPOINT`) stacks widgets in one column
 * anyway: they keep their default sizes, top to bottom in the order given.
 */
export function layoutGroup(
  members: ReadonlyArray<GroupMember>,
  canvas: { width: number; height: number },
  opts: { scrollbarWidth?: number } = {},
): Rect[] {
  const sizes = members.map(normalise)
  const g = PLACEMENT_GAP
  if (sizes.length === 0) return []
  if (canvas.width < STACK_BREAKPOINT) {
    let y = g
    return sizes.map((s) => {
      const box = { x: g, y, width: s.width, height: s.height }
      y += s.height + g
      return box
    })
  }
  const boxes = layoutColumns(sizes, canvas)
  const scrollbar = opts.scrollbarWidth ?? 0
  if (scrollbar > 0 && boxes.some((b) => b.y + b.height + g > canvas.height)) {
    return layoutColumns(sizes, { width: canvas.width - scrollbar, height: canvas.height })
  }
  return boxes
}

interface Size {
  width: number
  height: number
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

/** Fills in missing constraints (no min: it can't shrink; no max: it can grow) and keeps the default within them. */
function normalise(m: GroupMember): Size {
  const minWidth = Math.min(m.width, m.minWidth ?? m.width)
  const minHeight = Math.min(m.height, m.minHeight ?? m.height)
  const maxWidth = Math.max(minWidth, m.maxWidth ?? Infinity)
  const maxHeight = Math.max(minHeight, m.maxHeight ?? Infinity)
  return {
    width: Math.min(m.width, maxWidth),
    height: Math.min(m.height, maxHeight),
    minWidth, minHeight, maxWidth, maxHeight,
  }
}

function layoutColumns(sizes: Size[], canvas: { width: number; height: number }): Rect[] {
  const g = PLACEMENT_GAP
  const { columns, colWidth } = chooseColumns(sizes, canvas)
  const boxes: Rect[] = []
  let x = g
  columns.forEach((col, i) => {
    const heights = columnHeights(col, canvas.height)
    let y = g
    col.forEach((s, j) => {
      boxes.push({ x, y, width: Math.min(colWidth[i]!, s.maxWidth), height: heights[j]! })
      y += heights[j]! + g
    })
    x += colWidth[i]! + g
  })
  return boxes
}

interface Candidate {
  columns: Size[][]
  colWidth: number[]
  /** The most any widget is shrunk, as a share of its default width. */
  shrink: number
  fitsHeight: boolean
}

/**
 * The widgets split into columns, and the columns' widths: for each column
 * count, the split with the shortest tallest column among those that fit
 * across at minimum widths (one column always counts); then the count that
 * fits the view's height and shrinks widgets least, a tie going to more
 * columns.
 */
function chooseColumns(sizes: Size[], canvas: { width: number; height: number }): Candidate {
  const g = PLACEMENT_GAP
  const candidates: Candidate[] = []
  for (let count = sizes.length; count >= 1; count--) {
    let best: { columns: Size[][]; tallest: number } | undefined
    for (const columns of splits(sizes, count)) {
      const across = sum(columns.map((col) => Math.max(...col.map((s) => s.minWidth)))) + (count + 1) * g
      if (across > canvas.width && count > 1) continue
      const tallest = Math.max(...columns.map((col) => sum(col.map((s) => s.height)) + (col.length - 1) * g))
      if (!best || tallest < best.tallest) best = { columns, tallest }
    }
    if (best) candidates.push(sizeColumns(best.columns, canvas))
  }
  // Candidates run from most columns to fewest, so the first of equals is the one with more columns.
  const SAME = 1e-9
  return candidates.reduce((best, c) => {
    if (c.fitsHeight !== best.fitsHeight) return c.fitsHeight ? c : best
    return c.shrink < best.shrink - SAME ? c : best
  })
}

/** Column widths shrunk by one fraction to fit across, and how the layout fares. */
function sizeColumns(columns: Size[][], canvas: { width: number; height: number }): Candidate {
  const g = PLACEMENT_GAP
  const colMin = columns.map((col) => Math.max(...col.map((s) => s.minWidth)))
  const colDefault = columns.map((col) => Math.max(...col.map((s) => s.width)))
  const room = canvas.width - (columns.length + 1) * g
  const sumMin = sum(colMin)
  const sumDefault = sum(colDefault)
  const t = sumDefault <= room ? 1 : sumDefault === sumMin ? 0 : Math.max(0, (room - sumMin) / (sumDefault - sumMin))
  const exact = columns.map((_, i) => colMin[i]! + t * (colDefault[i]! - colMin[i]!))
  const shrink = Math.max(...columns.flatMap((col, i) =>
    col.map((s) => Math.max(0, (s.width - Math.min(exact[i]!, s.maxWidth)) / s.width))))
  const fitsHeight = columns.every((col) => sum(col.map((s) => s.minHeight)) + (col.length + 1) * g <= canvas.height)
  return { columns, colWidth: exact.map(Math.floor), shrink, fitsHeight }
}

/** Every way to cut `items` into `count` non-empty runs, keeping their order. */
function splits<T>(items: T[], count: number): T[][][] {
  if (count === 1) return [[items]]
  const out: T[][][] = []
  for (let first = 1; first <= items.length - count + 1; first++) {
    for (const rest of splits(items.slice(first), count - 1)) out.push([items.slice(0, first), ...rest])
  }
  return out
}

/**
 * Heights for one column: the view's height (less the gaps) shared in
 * proportion to default heights, within each widget's min and max. When the
 * minimums don't fit, default heights capped to the view (not below the
 * minimum), and the board scrolls.
 */
function columnHeights(col: Size[], viewHeight: number): number[] {
  const g = PLACEMENT_GAP
  const room = viewHeight - (col.length + 1) * g
  if (sum(col.map((s) => s.minHeight)) > room) {
    return col.map((s) => Math.max(s.minHeight, Math.min(s.height, viewHeight - 2 * g)))
  }
  const heights: (number | undefined)[] = col.map(() => undefined)
  // Share what is left among the widgets not yet held at a limit. If some
  // shares pass a limit, hold those at it (the side that is further out
  // first, so the others' new shares stay within theirs) and share again.
  for (;;) {
    const free = col.flatMap((_, i) => (heights[i] === undefined ? [i] : []))
    if (free.length === 0) break
    const left = room - sum(heights.map((h) => h ?? 0))
    const weight = sum(free.map((i) => col[i]!.height))
    const share = (i: number) => (left * col[i]!.height) / weight
    const under = free.filter((i) => share(i) < col[i]!.minHeight)
    const over = free.filter((i) => share(i) > col[i]!.maxHeight)
    if (under.length === 0 && over.length === 0) {
      for (const i of free) heights[i] = share(i)
      break
    }
    const short = sum(under.map((i) => col[i]!.minHeight - share(i)))
    const spare = sum(over.map((i) => share(i) - col[i]!.maxHeight))
    if (short >= spare) for (const i of under) heights[i] = col[i]!.minHeight
    else for (const i of over) heights[i] = col[i]!.maxHeight
  }
  return heights.map((h) => Math.floor(h!))
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
