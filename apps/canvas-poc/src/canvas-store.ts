import { create } from 'zustand'

export interface PanelItem {
  id: string
  pos_x: number
  pos_y: number
  width: number
  height: number
  z_index: number
  /** Arbitrary metadata (e.g. colour) — not used for layout logic */
  meta?: Record<string, unknown>
}

interface CanvasState {
  panels: PanelItem[]
  addPanel: (item: PanelItem) => void
  removePanel: (id: string) => void
  movePanel: (id: string, pos_x: number, pos_y: number) => void
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
