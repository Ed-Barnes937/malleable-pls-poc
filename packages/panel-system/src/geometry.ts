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
