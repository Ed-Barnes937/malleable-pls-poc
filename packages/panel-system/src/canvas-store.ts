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
  /** Display title shown in the panel header */
  title?: string
  /** Lens type id — used to resolve icon from the manifest registry */
  lensType?: string
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

/** What `arrangePanels` gives a panel: any of its layout and stacking. */
export type PanelArrangement = Partial<PanelLayout> & { z_index?: number }

/** What is saved of a panel's place on the board. */
export const LAYOUT_KEYS = ['pos_x', 'pos_y', 'width', 'height', 'z_index'] as const

interface PreviewBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** Where a Shift gesture will leave the widget being moved, and each neighbour it nudges. */
export interface ShiftPreview {
  moving: PreviewBox
  nudged: ReadonlyArray<PreviewBox>
}

interface CanvasState {
  panels: PanelItem[]
  /**
   * Bumped by every `setPanels` (another board, or the first load): the
   * panels are a new set, shown at once rather than each arriving.
   */
  panelSet: number
  setPanels: (panels: PanelItem[]) => void
  addPanel: (item: PanelItem) => void
  removePanel: (id: string) => void
  movePanel: (id: string, pos_x: number, pos_y: number) => void
  resizePanel: (id: string, pos_x: number, pos_y: number, width: number, height: number) => void
  bringToFront: (id: string) => void

  /** Currently selected panel — drives keyboard shortcuts and the selection ring */
  selectedPanelId: string | null
  selectPanel: (id: string | null) => void
  /** Move selection to the next (or previous) panel, cycling and bringing it to front */
  selectNext: (reverse?: boolean) => void

  /** Focus mode — dims all panels except this one. Distinct from z-order focus. */
  focusModePanelId: string | null
  enterFocusMode: (id: string) => void
  exitFocusMode: () => void

  /** Fullscreen — one panel fills the canvas area */
  fullscreenPanelId: string | null
  preFullscreenLayout: PanelLayout | null
  enterFullscreen: (id: string, canvasWidth: number, canvasHeight: number) => void
  exitFullscreen: () => void
  toggleFullscreen: (id: string, canvasWidth: number, canvasHeight: number) => void

  /**
   * Moves (and resizes) widgets the student didn't drag (Tidy up, its Undo,
   * a migrated board's first layout, a Shift drop's nudges): each panel in
   * `layout` takes what is given for it, gliding there (see `arranged`).
   */
  arrangePanels: (layout: ReadonlyMap<string, PanelArrangement>) => void

  /**
   * The panel a drag or resize is under way on, if any. The layout is saved
   * once the gesture ends (see CanvasEngine's `onLayoutChange`).
   */
  gesturePanelId: string | null
  setGesture: (id: string | null) => void
  /**
   * While a widget is dragged or resized with Shift held: where it, and each
   * widget it would nudge, will land.
   */
  shiftPreview: ShiftPreview | null
  setShiftPreview: (preview: ShiftPreview | null) => void

  /**
   * Bumped by every change that moves widgets without the student dragging
   * them (fullscreen in and out, Tidy up), so the canvas glides them from
   * where they were instead of jumping.
   */
  arranged: number

  /** Workspace background */
  background: BackgroundConfig
  setBackground: (background: BackgroundConfig) => void
}

/**
 * The panels as they should be saved: a fullscreen panel reports the layout it
 * will return to, so fullscreen never outlives a reload.
 */
export function persistableLayout(
  state: Pick<CanvasState, 'panels' | 'fullscreenPanelId' | 'preFullscreenLayout'>,
): PanelItem[] {
  const { panels, fullscreenPanelId, preFullscreenLayout } = state
  if (!fullscreenPanelId || !preFullscreenLayout) return panels
  return panels.map((p) => (p.id === fullscreenPanelId ? { ...p, ...preFullscreenLayout } : p))
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  panels: [],
  panelSet: 0,
  arranged: 0,

  // A new panel set (e.g. switching boards) starts with no selection, focus
  // mode or fullscreen: those are per-visit view state, never persisted.
  setPanels: (panels) =>
    set((state) => ({ panels, panelSet: state.panelSet + 1, selectedPanelId: null, focusModePanelId: null, fullscreenPanelId: null, preFullscreenLayout: null, gesturePanelId: null, shiftPreview: null })),

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
      selectedPanelId: state.selectedPanelId === id ? null : state.selectedPanelId,
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

  /* ── Selection ── */

  selectedPanelId: null,

  selectPanel: (id) =>
    set((state) =>
      id !== null && !state.panels.some((p) => p.id === id)
        ? state
        : { selectedPanelId: id },
    ),

  selectNext: (reverse = false) => {
    const state = get()
    const ids = state.panels.map((p) => p.id)
    if (ids.length === 0) return
    const idx = state.selectedPanelId ? ids.indexOf(state.selectedPanelId) : -1
    const next =
      idx === -1
        ? (reverse ? ids[ids.length - 1] : ids[0])
        : ids[(idx + (reverse ? -1 : 1) + ids.length) % ids.length]
    set({ selectedPanelId: next })
    state.bringToFront(next)
  },

  /* ── Focus mode ── */

  focusModePanelId: null,

  enterFocusMode: (id) =>
    set((state) => {
      const panel = state.panels.find((p) => p.id === id)
      if (!panel) return state
      return { focusModePanelId: id }
    }),

  exitFocusMode: () => set({ focusModePanelId: null }),

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
        arranged: state.arranged + 1,
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
        arranged: state.arranged + 1,
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

  /* ── Arranging ── */

  arrangePanels: (layout) =>
    set((state) => {
      let changed = false
      const panels = state.panels.map((p) => {
        const to = layout.get(p.id)
        if (!to) return p
        const next = {
          ...p,
          pos_x: to.pos_x ?? p.pos_x,
          pos_y: to.pos_y ?? p.pos_y,
          width: to.width ?? p.width,
          height: to.height ?? p.height,
          z_index: to.z_index ?? p.z_index,
        }
        if (LAYOUT_KEYS.every((k) => next[k] === p[k])) return p
        changed = true
        return next
      })
      return changed ? { panels, arranged: state.arranged + 1 } : state
    }),

  /* ── Gestures ── */

  gesturePanelId: null,
  setGesture: (id) =>
    set((state) => (state.gesturePanelId === id ? state : { gesturePanelId: id, ...(id === null ? { shiftPreview: null } : {}) })),
  shiftPreview: null,
  // Set on every pointer move: only a change of landing is news.
  setShiftPreview: (shiftPreview) =>
    set((state) => (JSON.stringify(state.shiftPreview) === JSON.stringify(shiftPreview) ? state : { shiftPreview })),

  /* ── Workspace background ── */

  background: DEFAULT_BACKGROUND,

  setBackground: (background) => set({ background }),
}))
