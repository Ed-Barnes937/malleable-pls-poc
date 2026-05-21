import { create } from 'zustand'

export interface SizeConstraints {
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

/** System default minimum dimensions when no constraints are specified */
export const DEFAULT_SIZE_CONSTRAINTS: Required<Pick<SizeConstraints, 'minWidth' | 'minHeight'>> = {
  minWidth: 200,
  minHeight: 150,
}

export interface PanelItem {
  id: string
  pos_x: number
  pos_y: number
  width: number
  height: number
  z_index: number
  /** Optional size constraints for resize clamping */
  constraints?: SizeConstraints
  /** Arbitrary metadata (e.g. colour) — not used for layout logic */
  meta?: Record<string, unknown>
}

/** Clamp dimensions to the panel's size constraints (or system defaults) */
export function clampDimensions(
  width: number,
  height: number,
  constraints?: SizeConstraints,
): { width: number; height: number } {
  const minW = constraints?.minWidth ?? DEFAULT_SIZE_CONSTRAINTS.minWidth
  const minH = constraints?.minHeight ?? DEFAULT_SIZE_CONSTRAINTS.minHeight
  const maxW = constraints?.maxWidth ?? Infinity
  const maxH = constraints?.maxHeight ?? Infinity

  return {
    width: Math.min(Math.max(width, minW), maxW),
    height: Math.min(Math.max(height, minH), maxH),
  }
}

interface CanvasState {
  panels: PanelItem[]
  addPanel: (item: PanelItem) => void
  removePanel: (id: string) => void
  movePanel: (id: string, pos_x: number, pos_y: number) => void
  resizePanel: (id: string, pos_x: number, pos_y: number, width: number, height: number) => void
  bringToFront: (id: string) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  panels: [],

  addPanel: (item) =>
    set((state) => {
      if (state.panels.some((p) => p.id === item.id)) {
        console.warn(`addPanel: panel with id "${item.id}" already exists — skipping`)
        return state
      }
      return { panels: [...state.panels, item] }
    }),

  removePanel: (id) =>
    set((state) => ({ panels: state.panels.filter((p) => p.id !== id) })),

  movePanel: (id, pos_x, pos_y) =>
    set((state) => ({
      panels: state.panels.map((p) =>
        p.id === id ? { ...p, pos_x, pos_y } : p,
      ),
    })),

  resizePanel: (id, pos_x, pos_y, width, height) =>
    set((state) => ({
      panels: state.panels.map((p) => {
        if (p.id !== id) return p
        const clamped = clampDimensions(width, height, p.constraints)
        return { ...p, pos_x, pos_y, width: clamped.width, height: clamped.height }
      }),
    })),

  bringToFront: (id) =>
    set((state) => {
      const panel = state.panels.find((p) => p.id === id)
      if (!panel) return state

      const maxZ = state.panels.length > 0
        ? Math.max(...state.panels.map((p) => p.z_index))
        : 0

      // Already on top — skip to avoid unbounded z-index growth
      if (panel.z_index === maxZ) return state

      return {
        panels: state.panels.map((p) =>
          p.id === id ? { ...p, z_index: maxZ + 1 } : p,
        ),
      }
    }),
}))
