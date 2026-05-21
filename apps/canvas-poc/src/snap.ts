/** Default grid size for shift-snap (in pixels) */
export const GRID_SIZE = 20

/** Snap a value to the nearest grid increment */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize
}
