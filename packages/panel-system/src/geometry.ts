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

/** Candidate offsets along one axis with `room` to spare, keeping `gap` from both edges where it fits. */
function positions(room: number, gap: number, step: number): number[] {
  if (room - gap < gap) return [Math.max(0, Math.min(gap, room))]
  const out: number[] = []
  for (let v = gap; v <= room - gap; v += step) out.push(v)
  return out
}
