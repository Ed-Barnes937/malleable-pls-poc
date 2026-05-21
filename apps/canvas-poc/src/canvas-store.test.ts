import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore, type PanelItem } from './canvas-store'

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
})
