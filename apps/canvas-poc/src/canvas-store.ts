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
    set((state) => ({ panels: [...state.panels, item] })),

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
      const maxZ = Math.max(...state.panels.map((p) => p.z_index))
      return {
        panels: state.panels.map((p) =>
          p.id === id ? { ...p, z_index: maxZ + 1 } : p,
        ),
      }
    }),
}))
