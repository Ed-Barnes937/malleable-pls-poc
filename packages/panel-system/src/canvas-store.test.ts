import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCanvasStore, clampDimensions, DEFAULT_SIZE_CONSTRAINTS, DEFAULT_BACKGROUND } from './canvas-store'
import type { PanelItem, BackgroundConfig } from './canvas-store'

function makePanel(overrides: Partial<PanelItem> = {}): PanelItem {
  return {
    id: 'p-1',
    pos_x: 100,
    pos_y: 100,
    width: 400,
    height: 300,
    z_index: 1,
    ...overrides,
  }
}

describe('canvas-store', () => {
  beforeEach(() => {
    useCanvasStore.setState(useCanvasStore.getInitialState())
  })

  /* ── setPanels ── */

  describe('setPanels', () => {
    it('replaces all panels', () => {
      const panels = [makePanel({ id: 'a' }), makePanel({ id: 'b' })]
      useCanvasStore.getState().setPanels(panels)
      expect(useCanvasStore.getState().panels).toEqual(panels)
    })

    it('clears panels when given an empty array', () => {
      useCanvasStore.getState().setPanels([makePanel()])
      useCanvasStore.getState().setPanels([])
      expect(useCanvasStore.getState().panels).toHaveLength(0)
    })
  })

  /* ── addPanel ── */

  describe('addPanel', () => {
    it('adds a new panel', () => {
      const panel = makePanel()
      useCanvasStore.getState().addPanel(panel)
      expect(useCanvasStore.getState().panels).toEqual([panel])
    })

    it('skips duplicate panel ids and warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const panel = makePanel({ id: 'dup' })
      useCanvasStore.getState().addPanel(panel)
      useCanvasStore.getState().addPanel(panel)

      expect(useCanvasStore.getState().panels).toHaveLength(1)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dup'))
      warnSpy.mockRestore()
    })

    it('appends to existing panels', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'first' }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'second' }))
      const ids = useCanvasStore.getState().panels.map((p) => p.id)
      expect(ids).toEqual(['first', 'second'])
    })
  })

  /* ── removePanel ── */

  describe('removePanel', () => {
    it('removes the panel by id', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'a' }), makePanel({ id: 'b' })])
      useCanvasStore.getState().removePanel('a')
      expect(useCanvasStore.getState().panels.map((p) => p.id)).toEqual(['b'])
    })

    it('clears focusModePanelId when the focused panel is removed', () => {
      const panel = makePanel({ id: 'focus-me' })
      useCanvasStore.getState().setPanels([panel])
      useCanvasStore.getState().enterFocusMode('focus-me')
      expect(useCanvasStore.getState().focusModePanelId).toBe('focus-me')

      useCanvasStore.getState().removePanel('focus-me')
      expect(useCanvasStore.getState().focusModePanelId).toBeNull()
    })

    it('preserves focusModePanelId when a different panel is removed', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'a' }), makePanel({ id: 'b' })])
      useCanvasStore.getState().enterFocusMode('a')
      useCanvasStore.getState().removePanel('b')
      expect(useCanvasStore.getState().focusModePanelId).toBe('a')
    })

    it('clears fullscreenPanelId and preFullscreenLayout when the fullscreened panel is removed', () => {
      const panel = makePanel({ id: 'fs' })
      useCanvasStore.getState().setPanels([panel])
      useCanvasStore.getState().enterFullscreen('fs', 1920, 1080)
      expect(useCanvasStore.getState().fullscreenPanelId).toBe('fs')

      useCanvasStore.getState().removePanel('fs')
      expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
      expect(useCanvasStore.getState().preFullscreenLayout).toBeNull()
    })

    it('preserves fullscreen state when a different panel is removed', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'a' }), makePanel({ id: 'b' })])
      useCanvasStore.getState().enterFullscreen('a', 1920, 1080)
      useCanvasStore.getState().removePanel('b')
      expect(useCanvasStore.getState().fullscreenPanelId).toBe('a')
      expect(useCanvasStore.getState().preFullscreenLayout).not.toBeNull()
    })
  })

  /* ── movePanel ── */

  describe('movePanel', () => {
    it('updates pos_x and pos_y', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'mv' })])
      useCanvasStore.getState().movePanel('mv', 500, 600)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.pos_x).toBe(500)
      expect(panel.pos_y).toBe(600)
    })

    it('does not affect other panel properties', () => {
      const original = makePanel({ id: 'mv', width: 400, height: 300, z_index: 5 })
      useCanvasStore.getState().setPanels([original])
      useCanvasStore.getState().movePanel('mv', 0, 0)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(400)
      expect(panel.height).toBe(300)
      expect(panel.z_index).toBe(5)
    })
  })

  /* ── resizePanel ── */

  describe('resizePanel', () => {
    it('updates position and dimensions', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'rs' })])
      useCanvasStore.getState().resizePanel('rs', 50, 60, 800, 600)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.pos_x).toBe(50)
      expect(panel.pos_y).toBe(60)
      expect(panel.width).toBe(800)
      expect(panel.height).toBe(600)
    })

    it('clamps dimensions to system defaults when no constraints', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'rs' })])
      useCanvasStore.getState().resizePanel('rs', 0, 0, 10, 10)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(DEFAULT_SIZE_CONSTRAINTS.minWidth)
      expect(panel.height).toBe(DEFAULT_SIZE_CONSTRAINTS.minHeight)
    })

    it('clamps dimensions to panel constraints', () => {
      useCanvasStore.getState().setPanels([
        makePanel({ id: 'rs', constraints: { minWidth: 300, maxWidth: 500, minHeight: 200, maxHeight: 400 } }),
      ])
      useCanvasStore.getState().resizePanel('rs', 0, 0, 1000, 1000)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(500)
      expect(panel.height).toBe(400)
    })
  })

  /* ── bringToFront ── */

  describe('bringToFront', () => {
    it('sets z_index to max + 1', () => {
      useCanvasStore.getState().setPanels([
        makePanel({ id: 'a', z_index: 1 }),
        makePanel({ id: 'b', z_index: 3 }),
        makePanel({ id: 'c', z_index: 2 }),
      ])
      useCanvasStore.getState().bringToFront('a')
      const panel = useCanvasStore.getState().panels.find((p) => p.id === 'a')!
      expect(panel.z_index).toBe(4)
    })

    it('is a no-op when panel is already at the highest z_index', () => {
      useCanvasStore.getState().setPanels([
        makePanel({ id: 'a', z_index: 1 }),
        makePanel({ id: 'b', z_index: 5 }),
      ])
      useCanvasStore.getState().bringToFront('b')
      const panel = useCanvasStore.getState().panels.find((p) => p.id === 'b')!
      expect(panel.z_index).toBe(5)
    })

    it('is a no-op for a non-existent panel', () => {
      const panels = [makePanel({ id: 'a', z_index: 1 })]
      useCanvasStore.getState().setPanels(panels)
      useCanvasStore.getState().bringToFront('nonexistent')
      expect(useCanvasStore.getState().panels).toEqual(panels)
    })
  })

  /* ── Focus mode ── */

  describe('focus mode', () => {
    it('enterFocusMode sets focusModePanelId', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'f' })])
      useCanvasStore.getState().enterFocusMode('f')
      expect(useCanvasStore.getState().focusModePanelId).toBe('f')
    })

    it('enterFocusMode is a no-op for non-existent panel', () => {
      useCanvasStore.getState().enterFocusMode('ghost')
      expect(useCanvasStore.getState().focusModePanelId).toBeNull()
    })

    it('exitFocusMode clears focusModePanelId', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'f' })])
      useCanvasStore.getState().enterFocusMode('f')
      useCanvasStore.getState().exitFocusMode()
      expect(useCanvasStore.getState().focusModePanelId).toBeNull()
    })

  })

  /* ── Fullscreen ── */

  describe('fullscreen', () => {
    const CANVAS_W = 1920
    const CANVAS_H = 1080
    const PADDING = 16

    it('enterFullscreen expands panel to fill canvas with padding', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'fs', pos_x: 100, pos_y: 100, width: 400, height: 300 })])
      useCanvasStore.getState().enterFullscreen('fs', CANVAS_W, CANVAS_H)

      const state = useCanvasStore.getState()
      expect(state.fullscreenPanelId).toBe('fs')
      const panel = state.panels[0]
      expect(panel.pos_x).toBe(PADDING)
      expect(panel.pos_y).toBe(PADDING)
      expect(panel.width).toBe(CANVAS_W - PADDING * 2)
      expect(panel.height).toBe(CANVAS_H - PADDING * 2)
    })

    it('enterFullscreen stores pre-fullscreen layout', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'fs', pos_x: 50, pos_y: 60, width: 400, height: 300 })])
      useCanvasStore.getState().enterFullscreen('fs', CANVAS_W, CANVAS_H)

      expect(useCanvasStore.getState().preFullscreenLayout).toEqual({
        pos_x: 50,
        pos_y: 60,
        width: 400,
        height: 300,
      })
    })

    it('enterFullscreen is a no-op when another panel is already fullscreened', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'a' }), makePanel({ id: 'b' })])
      useCanvasStore.getState().enterFullscreen('a', CANVAS_W, CANVAS_H)
      useCanvasStore.getState().enterFullscreen('b', CANVAS_W, CANVAS_H)

      expect(useCanvasStore.getState().fullscreenPanelId).toBe('a')
    })

    it('enterFullscreen is a no-op for non-existent panel', () => {
      useCanvasStore.getState().enterFullscreen('ghost', CANVAS_W, CANVAS_H)
      expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
    })

    it('exitFullscreen restores the pre-fullscreen layout', () => {
      const original = makePanel({ id: 'fs', pos_x: 50, pos_y: 60, width: 400, height: 300 })
      useCanvasStore.getState().setPanels([original])
      useCanvasStore.getState().enterFullscreen('fs', CANVAS_W, CANVAS_H)
      useCanvasStore.getState().exitFullscreen()

      const state = useCanvasStore.getState()
      expect(state.fullscreenPanelId).toBeNull()
      expect(state.preFullscreenLayout).toBeNull()
      const panel = state.panels[0]
      expect(panel.pos_x).toBe(50)
      expect(panel.pos_y).toBe(60)
      expect(panel.width).toBe(400)
      expect(panel.height).toBe(300)
    })

    it('exitFullscreen when not in fullscreen clears state cleanly', () => {
      useCanvasStore.getState().exitFullscreen()
      expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
      expect(useCanvasStore.getState().preFullscreenLayout).toBeNull()
    })

    it('toggleFullscreen enters fullscreen when not fullscreened', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'fs' })])
      useCanvasStore.getState().toggleFullscreen('fs', CANVAS_W, CANVAS_H)
      expect(useCanvasStore.getState().fullscreenPanelId).toBe('fs')
    })

    it('toggleFullscreen exits fullscreen when same panel is fullscreened', () => {
      const original = makePanel({ id: 'fs', pos_x: 50, pos_y: 60, width: 400, height: 300 })
      useCanvasStore.getState().setPanels([original])
      useCanvasStore.getState().enterFullscreen('fs', CANVAS_W, CANVAS_H)
      useCanvasStore.getState().toggleFullscreen('fs', CANVAS_W, CANVAS_H)

      const state = useCanvasStore.getState()
      expect(state.fullscreenPanelId).toBeNull()
      expect(state.panels[0].pos_x).toBe(50)
    })
  })

  /* ── organizePanels ── */

  describe('organizePanels', () => {
    it('handles 0 panels without error', () => {
      useCanvasStore.getState().organizePanels(1920, 1080)
      expect(useCanvasStore.getState().panels).toEqual([])
    })

    it('positions a single panel at GAP offset', () => {
      useCanvasStore.getState().setPanels([makePanel({ id: 'solo', width: 400, height: 300 })])
      useCanvasStore.getState().organizePanels(1920, 1080)

      const panel = useCanvasStore.getState().panels[0]
      expect(panel.pos_x).toBe(20) // GAP = 20
      expect(panel.pos_y).toBe(20)
      expect(panel.z_index).toBe(1)
    })

    it('wraps panels to next row when they exceed canvas width', () => {
      useCanvasStore.getState().setPanels([
        makePanel({ id: 'a', width: 500, height: 300 }),
        makePanel({ id: 'b', width: 500, height: 300 }),
        makePanel({ id: 'c', width: 500, height: 300 }),
      ])
      // Canvas width 1100: first two panels fit (20 + 500 + 20 + 500 + 20 = 1060), third wraps
      useCanvasStore.getState().organizePanels(1100, 2000)

      const panels = useCanvasStore.getState().panels
      // Panels are sorted by area (all same area, so original order preserved)
      const third = panels[2]
      expect(third.pos_y).toBeGreaterThan(20) // wrapped to a new row
    })

    it('assigns sequential z_index values', () => {
      useCanvasStore.getState().setPanels([
        makePanel({ id: 'a', z_index: 99, width: 600, height: 400 }),
        makePanel({ id: 'b', z_index: 1, width: 300, height: 200 }),
      ])
      useCanvasStore.getState().organizePanels(2000, 2000)

      const panels = useCanvasStore.getState().panels
      // sorted by area descending: 'a' (240000) first, 'b' (60000) second
      expect(panels[0].z_index).toBe(1)
      expect(panels[1].z_index).toBe(2)
    })

    it('scales panels down when total height exceeds canvas', () => {
      useCanvasStore.getState().setPanels([
        makePanel({ id: 'tall', width: 200, height: 500 }),
      ])
      // Canvas height 100 is smaller than total height (20 + 500 + 20 = 540)
      useCanvasStore.getState().organizePanels(1000, 100)

      const panel = useCanvasStore.getState().panels[0]
      // Scaled down, but width/height stay at least minWidth/minHeight
      expect(panel.pos_y).toBeLessThan(20)
      expect(panel.height).toBeGreaterThanOrEqual(DEFAULT_SIZE_CONSTRAINTS.minHeight)
      expect(panel.width).toBeGreaterThanOrEqual(DEFAULT_SIZE_CONSTRAINTS.minWidth)
    })
  })

  /* ── setBackground ── */

  describe('setBackground', () => {
    it('starts with DEFAULT_BACKGROUND', () => {
      expect(useCanvasStore.getState().background).toEqual(DEFAULT_BACKGROUND)
    })

    it('sets background type and value', () => {
      const bg: BackgroundConfig = { type: 'gradient', value: 'linear-gradient(red, blue)' }
      useCanvasStore.getState().setBackground(bg)
      expect(useCanvasStore.getState().background).toEqual(bg)
    })
  })

  /* ── clampDimensions ── */

  describe('clampDimensions', () => {
    it('returns values unchanged when within defaults', () => {
      const result = clampDimensions(400, 300)
      expect(result).toEqual({ width: 400, height: 300 })
    })

    it('clamps to system default minimums when no constraints given', () => {
      const result = clampDimensions(10, 10)
      expect(result).toEqual({
        width: DEFAULT_SIZE_CONSTRAINTS.minWidth,
        height: DEFAULT_SIZE_CONSTRAINTS.minHeight,
      })
    })

    it('clamps to custom min constraints', () => {
      const result = clampDimensions(10, 10, { minWidth: 300, minHeight: 250 })
      expect(result).toEqual({ width: 300, height: 250 })
    })

    it('clamps to custom max constraints', () => {
      const result = clampDimensions(1000, 1000, { maxWidth: 500, maxHeight: 400 })
      expect(result).toEqual({ width: 500, height: 400 })
    })

    it('min wins over max when min exceeds max', () => {
      const result = clampDimensions(100, 100, { minWidth: 500, maxWidth: 300, minHeight: 400, maxHeight: 200 })
      expect(result).toEqual({ width: 500, height: 400 })
    })

    it('handles partial constraints (only min)', () => {
      const result = clampDimensions(50, 50, { minWidth: 100 })
      expect(result).toEqual({ width: 100, height: DEFAULT_SIZE_CONSTRAINTS.minHeight })
    })

    it('handles partial constraints (only max)', () => {
      const result = clampDimensions(1000, 1000, { maxWidth: 500 })
      expect(result).toEqual({ width: 500, height: 1000 })
    })
  })
})
