import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore, clampDimensions, DEFAULT_SIZE_CONSTRAINTS, type PanelItem } from './canvas-store'

function makePanel(overrides: Partial<PanelItem> = {}): PanelItem {
  return {
    id: 'test-1',
    pos_x: 10,
    pos_y: 20,
    width: 100,
    height: 80,
    z_index: 1,
    ...overrides,
  }
}

describe('canvas-store', () => {
  beforeEach(() => {
    // Reset store to empty state before each test
    useCanvasStore.setState({ panels: [] })
  })

  describe('addPanel', () => {
    it('adds a panel to empty store', () => {
      const panel = makePanel()
      useCanvasStore.getState().addPanel(panel)
      expect(useCanvasStore.getState().panels).toHaveLength(1)
      expect(useCanvasStore.getState().panels[0]).toEqual(panel)
    })

    it('adds multiple panels', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a' }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b' }))
      expect(useCanvasStore.getState().panels).toHaveLength(2)
    })

    it('rejects duplicate IDs', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'dup' }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'dup', pos_x: 999 }))
      expect(useCanvasStore.getState().panels).toHaveLength(1)
      // Original panel unchanged
      expect(useCanvasStore.getState().panels[0].pos_x).toBe(10)
    })
  })

  describe('removePanel', () => {
    it('removes a panel by id', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a' }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b' }))
      useCanvasStore.getState().removePanel('a')
      expect(useCanvasStore.getState().panels).toHaveLength(1)
      expect(useCanvasStore.getState().panels[0].id).toBe('b')
    })

    it('does nothing when id does not exist', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a' }))
      useCanvasStore.getState().removePanel('nonexistent')
      expect(useCanvasStore.getState().panels).toHaveLength(1)
    })
  })

  describe('movePanel', () => {
    it('updates position of a panel', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', pos_x: 0, pos_y: 0 }))
      useCanvasStore.getState().movePanel('a', 50, 75)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.pos_x).toBe(50)
      expect(panel.pos_y).toBe(75)
    })

    it('does not modify other panels', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', pos_x: 10, pos_y: 10 }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b', pos_x: 20, pos_y: 20 }))
      useCanvasStore.getState().movePanel('a', 100, 200)
      const panelB = useCanvasStore.getState().panels.find((p) => p.id === 'b')!
      expect(panelB.pos_x).toBe(20)
      expect(panelB.pos_y).toBe(20)
    })

    it('does nothing when id does not exist', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', pos_x: 10, pos_y: 20 }))
      useCanvasStore.getState().movePanel('nonexistent', 999, 999)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.pos_x).toBe(10)
      expect(panel.pos_y).toBe(20)
    })

    it('preserves other panel properties', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', width: 300, height: 200, z_index: 5 }))
      useCanvasStore.getState().movePanel('a', 50, 50)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(300)
      expect(panel.height).toBe(200)
      expect(panel.z_index).toBe(5)
    })
  })

  describe('bringToFront', () => {
    it('sets panel z_index to max + 1', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', z_index: 1 }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b', z_index: 2 }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'c', z_index: 3 }))
      useCanvasStore.getState().bringToFront('a')
      const panel = useCanvasStore.getState().panels.find((p) => p.id === 'a')!
      expect(panel.z_index).toBe(4)
    })

    it('does not change z_index of other panels', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', z_index: 1 }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b', z_index: 2 }))
      useCanvasStore.getState().bringToFront('a')
      const panelB = useCanvasStore.getState().panels.find((p) => p.id === 'b')!
      expect(panelB.z_index).toBe(2)
    })

    it('no-ops when panel is already at front', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', z_index: 1 }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b', z_index: 5 }))
      useCanvasStore.getState().bringToFront('b')
      const panel = useCanvasStore.getState().panels.find((p) => p.id === 'b')!
      // Already at max z — should remain unchanged
      expect(panel.z_index).toBe(5)
    })

    it('no-ops for single panel (already at top)', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'solo', z_index: 1 }))
      useCanvasStore.getState().bringToFront('solo')
      // Single panel is always at max z — no change
      expect(useCanvasStore.getState().panels[0].z_index).toBe(1)
    })

    it('does nothing when id does not exist', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', z_index: 3 }))
      useCanvasStore.getState().bringToFront('nonexistent')
      expect(useCanvasStore.getState().panels[0].z_index).toBe(3)
    })

    it('works with consecutive bringToFront calls', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', z_index: 1 }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b', z_index: 2 }))

      useCanvasStore.getState().bringToFront('a')
      expect(useCanvasStore.getState().panels.find((p) => p.id === 'a')!.z_index).toBe(3)

      useCanvasStore.getState().bringToFront('b')
      expect(useCanvasStore.getState().panels.find((p) => p.id === 'b')!.z_index).toBe(4)
    })
  })

  describe('resizePanel', () => {
    it('changes position and dimensions', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', pos_x: 10, pos_y: 20, width: 300, height: 200 }))
      useCanvasStore.getState().resizePanel('a', 5, 15, 400, 250)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.pos_x).toBe(5)
      expect(panel.pos_y).toBe(15)
      expect(panel.width).toBe(400)
      expect(panel.height).toBe(250)
    })

    it('clamps to default minimum dimensions', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', width: 300, height: 200 }))
      useCanvasStore.getState().resizePanel('a', 10, 20, 50, 30)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(DEFAULT_SIZE_CONSTRAINTS.minWidth)
      expect(panel.height).toBe(DEFAULT_SIZE_CONSTRAINTS.minHeight)
    })

    it('clamps to custom constraints', () => {
      useCanvasStore.getState().addPanel(makePanel({
        id: 'a',
        width: 300,
        height: 200,
        constraints: { minWidth: 100, minHeight: 100, maxWidth: 500, maxHeight: 400 },
      }))
      // Below min
      useCanvasStore.getState().resizePanel('a', 0, 0, 50, 50)
      let panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(100)
      expect(panel.height).toBe(100)

      // Above max
      useCanvasStore.getState().resizePanel('a', 0, 0, 800, 600)
      panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(500)
      expect(panel.height).toBe(400)
    })

    it('does not modify other panels', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', width: 300, height: 200 }))
      useCanvasStore.getState().addPanel(makePanel({ id: 'b', pos_x: 50, pos_y: 60, width: 250, height: 180 }))
      useCanvasStore.getState().resizePanel('a', 0, 0, 400, 300)
      const panelB = useCanvasStore.getState().panels.find((p) => p.id === 'b')!
      expect(panelB.width).toBe(250)
      expect(panelB.height).toBe(180)
    })

    it('does nothing when id does not exist', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', width: 300, height: 200 }))
      useCanvasStore.getState().resizePanel('nonexistent', 0, 0, 400, 300)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.width).toBe(300)
      expect(panel.height).toBe(200)
    })

    it('preserves z_index and meta', () => {
      useCanvasStore.getState().addPanel(makePanel({ id: 'a', z_index: 5, width: 300, height: 200, meta: { colour: 'red' } }))
      useCanvasStore.getState().resizePanel('a', 0, 0, 400, 300)
      const panel = useCanvasStore.getState().panels[0]
      expect(panel.z_index).toBe(5)
      expect(panel.meta?.colour).toBe('red')
    })
  })

  describe('clampDimensions', () => {
    it('returns unclamped values when within defaults', () => {
      const result = clampDimensions(300, 200)
      expect(result).toEqual({ width: 300, height: 200 })
    })

    it('clamps to system default minimums', () => {
      const result = clampDimensions(50, 30)
      expect(result).toEqual({ width: 200, height: 150 })
    })

    it('clamps to custom min constraints', () => {
      const result = clampDimensions(50, 30, { minWidth: 100, minHeight: 80 })
      expect(result).toEqual({ width: 100, height: 80 })
    })

    it('clamps to custom max constraints', () => {
      const result = clampDimensions(1000, 800, { maxWidth: 500, maxHeight: 400 })
      expect(result).toEqual({ width: 500, height: 400 })
    })

    it('handles both min and max simultaneously', () => {
      const constraints = { minWidth: 100, minHeight: 80, maxWidth: 500, maxHeight: 400 }
      expect(clampDimensions(50, 50, constraints)).toEqual({ width: 100, height: 80 })
      expect(clampDimensions(600, 500, constraints)).toEqual({ width: 500, height: 400 })
      expect(clampDimensions(300, 200, constraints)).toEqual({ width: 300, height: 200 })
    })

    it('uses system defaults when constraints omit min values', () => {
      const result = clampDimensions(50, 30, { maxWidth: 500 })
      expect(result.width).toBe(200) // system default minWidth
      expect(result.height).toBe(150) // system default minHeight
    })

    it('min wins when min exceeds max', () => {
      const result = clampDimensions(250, 200, { minWidth: 500, maxWidth: 300, minHeight: 400, maxHeight: 200 })
      // min takes priority — effective max becomes min
      expect(result.width).toBe(500)
      expect(result.height).toBe(400)
    })

    it('handles min > max for one axis only', () => {
      const result = clampDimensions(100, 100, { minWidth: 400, maxWidth: 300, minHeight: 50, maxHeight: 500 })
      expect(result.width).toBe(400)  // min wins over contradictory max
      expect(result.height).toBe(100) // normal clamping, value is within range
    })
  })
})
