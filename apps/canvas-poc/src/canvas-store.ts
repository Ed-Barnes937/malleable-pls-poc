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

export type PanelType = 'document' | 'audio' | 'tags' | 'chart' | 'image' | 'note' | 'transcript'

export interface PanelItem {
  id: string
  pos_x: number
  pos_y: number
  width: number
  height: number
  z_index: number
  /** Display title shown in the panel header */
  title?: string
  /** Panel type — determines the icon shown in the header */
  type?: PanelType
  /** Optional size constraints for resize clamping */
  constraints?: SizeConstraints
  /** Arbitrary metadata — not used for layout logic */
  meta?: Record<string, unknown>
}

/** Clamp dimensions to the panel's size constraints (or system defaults).
 *  If min exceeds max for either axis, min wins (the panel cannot shrink
 *  below its minimum regardless of a misconfigured maximum). */
export function clampDimensions(
  width: number,
  height: number,
  constraints?: SizeConstraints,
): { width: number; height: number } {
  const minW = constraints?.minWidth ?? DEFAULT_SIZE_CONSTRAINTS.minWidth
  const minH = constraints?.minHeight ?? DEFAULT_SIZE_CONSTRAINTS.minHeight
  const maxW = constraints?.maxWidth ?? Infinity
  const maxH = constraints?.maxHeight ?? Infinity

  // Effective max must be at least min to avoid contradictions
  const effectiveMaxW = Math.max(maxW, minW)
  const effectiveMaxH = Math.max(maxH, minH)

  return {
    width: Math.min(Math.max(width, minW), effectiveMaxW),
    height: Math.min(Math.max(height, minH), effectiveMaxH),
  }
}

/** Layout snapshot stored before entering fullscreen so we can restore on exit */
export interface PanelLayout {
  pos_x: number
  pos_y: number
  width: number
  height: number
}

/** Workspace background configuration */
export type BackgroundType = 'solid' | 'gradient' | 'image' | 'none'

export interface BackgroundConfig {
  type: BackgroundType
  value: string
}

export const DEFAULT_BACKGROUND: BackgroundConfig = { type: 'none', value: '' }

interface CanvasState {
  panels: PanelItem[]
  addPanel: (item: PanelItem) => void
  removePanel: (id: string) => void
  movePanel: (id: string, pos_x: number, pos_y: number) => void
  resizePanel: (id: string, pos_x: number, pos_y: number, width: number, height: number) => void
  bringToFront: (id: string) => void

  /** Focus mode — dims all panels except this one. Distinct from z-order focus. */
  focusModePanelId: string | null
  enterFocusMode: (id: string) => void
  exitFocusMode: () => void
  toggleFocusMode: (id: string) => void

  /** Fullscreen — one panel fills the canvas area */
  fullscreenPanelId: string | null
  preFullscreenLayout: PanelLayout | null
  enterFullscreen: (id: string, canvasWidth: number, canvasHeight: number) => void
  exitFullscreen: () => void
  toggleFullscreen: (id: string, canvasWidth: number, canvasHeight: number) => void

  /** Auto-organize panels into a non-overlapping grid layout */
  organizePanels: (canvasWidth: number) => void

  /** Workspace background */
  background: BackgroundConfig
  setBackground: (background: BackgroundConfig) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
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
    set((state) => ({
      panels: state.panels.filter((p) => p.id !== id),
      focusModePanelId: state.focusModePanelId === id ? null : state.focusModePanelId,
      fullscreenPanelId: state.fullscreenPanelId === id ? null : state.fullscreenPanelId,
      preFullscreenLayout: state.fullscreenPanelId === id ? null : state.preFullscreenLayout,
    })),

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

  /* ── Focus mode ── */

  focusModePanelId: null,

  enterFocusMode: (id) =>
    set((state) => {
      const panel = state.panels.find((p) => p.id === id)
      if (!panel) return state
      return { focusModePanelId: id }
    }),

  exitFocusMode: () => set({ focusModePanelId: null }),

  toggleFocusMode: (id) =>
    set((state) => {
      if (state.focusModePanelId === id) return { focusModePanelId: null }
      const panel = state.panels.find((p) => p.id === id)
      if (!panel) return state
      return { focusModePanelId: id }
    }),

  /* ── Fullscreen ── */

  fullscreenPanelId: null,
  preFullscreenLayout: null,

  enterFullscreen: (id, canvasWidth, canvasHeight) =>
    set((state) => {
      // No-op if any panel is already fullscreened (prevents losing the first panel's layout)
      if (state.fullscreenPanelId) return state

      const panel = state.panels.find((p) => p.id === id)
      if (!panel) return state

      const PADDING = 16

      return {
        fullscreenPanelId: id,
        preFullscreenLayout: {
          pos_x: panel.pos_x,
          pos_y: panel.pos_y,
          width: panel.width,
          height: panel.height,
        },
        panels: state.panels.map((p) =>
          p.id === id
            ? {
                ...p,
                pos_x: PADDING,
                pos_y: PADDING,
                width: canvasWidth - PADDING * 2,
                height: canvasHeight - PADDING * 2,
              }
            : p,
        ),
      }
    }),

  exitFullscreen: () =>
    set((state) => {
      if (!state.fullscreenPanelId || !state.preFullscreenLayout) {
        return { fullscreenPanelId: null, preFullscreenLayout: null }
      }
      const { pos_x, pos_y, width, height } = state.preFullscreenLayout
      const panelId = state.fullscreenPanelId
      return {
        fullscreenPanelId: null,
        preFullscreenLayout: null,
        panels: state.panels.map((p) =>
          p.id === panelId
            ? { ...p, pos_x, pos_y, width, height }
            : p,
        ),
      }
    }),

  toggleFullscreen: (id, canvasWidth, canvasHeight) => {
    const state = get()
    if (state.fullscreenPanelId === id) {
      state.exitFullscreen()
    } else {
      state.enterFullscreen(id, canvasWidth, canvasHeight)
    }
  },

  /* ── Auto-organize ── */

  organizePanels: (canvasWidth: number) =>
    set((state) => {
      const GAP = 20
      const sorted = [...state.panels].sort((a, b) => (b.width * b.height) - (a.width * a.height))

      let curX = GAP
      let curY = GAP
      let rowHeight = 0

      const updated = sorted.map((panel, i) => {
        if (i > 0 && curX + panel.width + GAP > canvasWidth) {
          curX = GAP
          curY += rowHeight + GAP
          rowHeight = 0
        }
        const placed = { ...panel, pos_x: curX, pos_y: curY, z_index: i + 1 }
        curX += panel.width + GAP
        rowHeight = Math.max(rowHeight, panel.height)
        return placed
      })

      return { panels: updated }
    }),

  /* ── Workspace background ── */

  background: DEFAULT_BACKGROUND,

  setBackground: (background) => set({ background }),
}))
