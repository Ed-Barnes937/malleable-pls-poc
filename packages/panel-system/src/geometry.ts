/**
 * Where a panel's top-left may go while it moves: at least
 * visible = min(100, width/2, height/2) pixels stay on the canvas, and the
 * top edge (the header, its drag handle) never goes above it.
 */
export function canvasBounds(
  size: { width: number; height: number },
  canvas: { width: number; height: number },
): { minX: number; minY: number; maxX: number; maxY: number } {
  const visible = Math.min(100, size.width / 2, size.height / 2)
  return { minX: visible - size.width, minY: 0, maxX: canvas.width - visible, maxY: canvas.height - visible }
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
