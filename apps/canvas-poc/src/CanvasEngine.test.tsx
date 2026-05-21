import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CanvasEngine } from './CanvasEngine'
import { useCanvasStore, type PanelItem } from './canvas-store'

/**
 * Testing notes:
 *
 * - Framer Motion's drag behavior relies on pointer events and layout
 *   measurements that jsdom cannot simulate. Actual drag-end position updates
 *   are therefore tested indirectly via store action tests (canvas-store.test.ts).
 * - Component tests here verify: rendering at correct positions, z-index ordering
 *   on pointer down, and that the onLayoutChange callback fires.
 */

function seedPanels() {
  const { addPanel } = useCanvasStore.getState()
  addPanel({ id: 'red', pos_x: 10, pos_y: 20, width: 100, height: 80, z_index: 1 })
  addPanel({ id: 'blue', pos_x: 50, pos_y: 60, width: 120, height: 90, z_index: 2 })
  addPanel({ id: 'green', pos_x: 200, pos_y: 100, width: 150, height: 100, z_index: 3 })
}

describe('CanvasEngine', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      panels: [],
      focusModePanelId: null,
      fullscreenPanelId: null,
      preFullscreenLayout: null,
    })
  })

  it('renders the canvas container', () => {
    render(<CanvasEngine />)
    expect(screen.getByTestId('canvas-container')).toBeInTheDocument()
  })

  it('renders no panels when store is empty', () => {
    render(<CanvasEngine />)
    const container = screen.getByTestId('canvas-container')
    expect(container.children).toHaveLength(0)
  })

  it('renders panels from the store', () => {
    seedPanels()
    render(<CanvasEngine />)
    expect(screen.getByTestId('panel-red')).toBeInTheDocument()
    expect(screen.getByTestId('panel-blue')).toBeInTheDocument()
    expect(screen.getByTestId('panel-green')).toBeInTheDocument()
  })

  it('positions panels at their specified coordinates', () => {
    seedPanels()
    render(<CanvasEngine />)
    const redPanel = screen.getByTestId('panel-red')
    expect(redPanel.style.left).toBe('10px')
    expect(redPanel.style.top).toBe('20px')
    expect(redPanel.style.width).toBe('100px')
    expect(redPanel.style.height).toBe('80px')
  })

  it('sets z-index from panel data', () => {
    seedPanels()
    render(<CanvasEngine />)
    const redPanel = screen.getByTestId('panel-red')
    const bluePanel = screen.getByTestId('panel-blue')
    const greenPanel = screen.getByTestId('panel-green')
    expect(redPanel.style.zIndex).toBe('1')
    expect(bluePanel.style.zIndex).toBe('2')
    expect(greenPanel.style.zIndex).toBe('3')
  })

  it('overlapping panels render with ascending z-index on DOM elements', () => {
    seedPanels()
    render(<CanvasEngine />)
    const redZ = Number(screen.getByTestId('panel-red').style.zIndex)
    const blueZ = Number(screen.getByTestId('panel-blue').style.zIndex)
    const greenZ = Number(screen.getByTestId('panel-green').style.zIndex)
    expect(redZ).toBeLessThan(blueZ)
    expect(blueZ).toBeLessThan(greenZ)
  })

  it('updates z-index when a panel receives pointer down', () => {
    seedPanels()
    render(<CanvasEngine />)

    const redPanel = screen.getByTestId('panel-red')
    fireEvent.pointerDown(redPanel)

    // red was z_index 1, max was 3, so new z_index should be 4
    const redInStore = useCanvasStore.getState().panels.find((p) => p.id === 'red')!
    expect(redInStore.z_index).toBe(4)
  })

  it('fires onLayoutChange callback after store updates', () => {
    const onLayoutChange = vi.fn()
    seedPanels()
    render(<CanvasEngine onLayoutChange={onLayoutChange} />)

    // Trigger a store change — bringToFront
    const redPanel = screen.getByTestId('panel-red')
    fireEvent.pointerDown(redPanel)

    expect(onLayoutChange).toHaveBeenCalled()
    const lastCall = onLayoutChange.mock.calls[onLayoutChange.mock.calls.length - 1][0]
    expect(lastCall.find((p: { id: string }) => p.id === 'red').z_index).toBe(4)
  })

  it('uses design token background instead of meta colour', () => {
    useCanvasStore.getState().addPanel({
      id: 'styled',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
    })
    render(<CanvasEngine />)
    const panel = screen.getByTestId('panel-styled')
    expect(panel.style.backgroundColor).toBe('var(--color-surface-raised)')
  })

  it('displays panel title in the header', () => {
    useCanvasStore.getState().addPanel({
      id: 'titled',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
      title: 'My Panel',
      type: 'document',
    })
    render(<CanvasEngine />)
    expect(screen.getByText('My Panel')).toBeInTheDocument()
  })

  it('shows "Untitled" when panel has no title', () => {
    useCanvasStore.getState().addPanel({
      id: 'notitled',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
    })
    render(<CanvasEngine />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('removes panel when close button is clicked', () => {
    useCanvasStore.getState().addPanel({
      id: 'closable',
      pos_x: 0,
      pos_y: 0,
      width: 200,
      height: 200,
      z_index: 1,
      title: 'Close Me',
    })
    render(<CanvasEngine />)
    expect(screen.getByTestId('panel-closable')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('panel-close-closable'))
    expect(screen.queryByTestId('panel-closable')).not.toBeInTheDocument()
  })

  it('applies focused shadow to the top z-index panel', () => {
    useCanvasStore.getState().addPanel({
      id: 'back',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
    })
    useCanvasStore.getState().addPanel({
      id: 'front',
      pos_x: 50,
      pos_y: 50,
      width: 100,
      height: 100,
      z_index: 2,
    })
    render(<CanvasEngine />)
    const frontPanel = screen.getByTestId('panel-front')
    expect(frontPanel.style.boxShadow).toBe('var(--shadow-panel-focused)')
    const backPanel = screen.getByTestId('panel-back')
    expect(backPanel.style.boxShadow).toBe('var(--shadow-panel)')
  })

  it('applies focused shadow on hover via CSS transition (not whileHover)', () => {
    useCanvasStore.getState().addPanel({
      id: 'hoverable',
      pos_x: 0,
      pos_y: 0,
      width: 200,
      height: 200,
      z_index: 1,
    })
    render(<CanvasEngine />)
    const panel = screen.getByTestId('panel-hoverable')
    // Single panel is already focused, so it has focused shadow
    expect(panel.style.boxShadow).toBe('var(--shadow-panel-focused)')

    // Add a second panel so the first is no longer focused
    act(() => {
      useCanvasStore.getState().addPanel({
        id: 'other',
        pos_x: 100,
        pos_y: 100,
        width: 200,
        height: 200,
        z_index: 2,
      })
    })

    // Re-check: hoverable is no longer focused
    expect(panel.style.boxShadow).toBe('var(--shadow-panel)')

    // Hover should elevate shadow
    fireEvent.mouseEnter(panel)
    expect(panel.style.boxShadow).toBe('var(--shadow-panel-focused)')

    // Un-hover should revert
    fireEvent.mouseLeave(panel)
    expect(panel.style.boxShadow).toBe('var(--shadow-panel)')
  })

  it('applies entrance animation initial state', () => {
    useCanvasStore.getState().addPanel({
      id: 'animated',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
    })
    render(<CanvasEngine />)
    // Motion sets initial transform including scale(0.95) and opacity 0
    // After animation completes these become scale(1) and opacity 1
    // We verify the panel renders (animation runs)
    expect(screen.getByTestId('panel-animated')).toBeInTheDocument()
  })

  describe('resize handles', () => {
    it('renders 8 resize handles per panel', () => {
      useCanvasStore.getState().addPanel({
        id: 'resizable',
        pos_x: 0,
        pos_y: 0,
        width: 300,
        height: 200,
        z_index: 1,
      })
      render(<CanvasEngine />)

      const directions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
      for (const dir of directions) {
        expect(screen.getByTestId(`resize-handle-${dir}`)).toBeInTheDocument()
      }
    })

    it('renders resize handles for each panel', () => {
      seedPanels()
      render(<CanvasEngine />)

      // Each panel should have its own resize handles container
      expect(screen.getByTestId('resize-handles-red')).toBeInTheDocument()
      expect(screen.getByTestId('resize-handles-blue')).toBeInTheDocument()
      expect(screen.getByTestId('resize-handles-green')).toBeInTheDocument()
    })

    it('resize handles container has pointer-events none by default', () => {
      useCanvasStore.getState().addPanel({
        id: 'test',
        pos_x: 0,
        pos_y: 0,
        width: 300,
        height: 200,
        z_index: 1,
      })
      render(<CanvasEngine />)

      const handlesContainer = screen.getByTestId('resize-handles-test')
      // Not hovered — pointer events should be none
      expect(handlesContainer.style.pointerEvents).toBe('none')
    })

    it('resize handles container gets pointer-events on mouse enter', () => {
      useCanvasStore.getState().addPanel({
        id: 'test',
        pos_x: 0,
        pos_y: 0,
        width: 300,
        height: 200,
        z_index: 1,
      })
      render(<CanvasEngine />)

      const panel = screen.getByTestId('panel-test')
      fireEvent.mouseEnter(panel)

      const handlesContainer = screen.getByTestId('resize-handles-test')
      expect(handlesContainer.style.pointerEvents).toBe('auto')
    })
  })

  describe('focus mode', () => {
    it('dims non-focused panels to 0.3 opacity when focus mode is active', () => {
      seedPanels()
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFocusMode('green')
      })

      const redPanel = screen.getByTestId('panel-red')
      const bluePanel = screen.getByTestId('panel-blue')
      const greenPanel = screen.getByTestId('panel-green')

      expect(redPanel.style.opacity).toBe('0.3')
      expect(bluePanel.style.opacity).toBe('0.3')
      expect(greenPanel.style.opacity).toBe('1')
    })

    it('restores full opacity when focus mode is exited', () => {
      seedPanels()
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFocusMode('green')
      })

      act(() => {
        useCanvasStore.getState().exitFocusMode()
      })

      const redPanel = screen.getByTestId('panel-red')
      const bluePanel = screen.getByTestId('panel-blue')

      expect(redPanel.style.opacity).toBe('1')
      expect(bluePanel.style.opacity).toBe('1')
    })

    it('clicking canvas background exits focus mode', () => {
      seedPanels()
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFocusMode('green')
      })

      expect(useCanvasStore.getState().focusModePanelId).toBe('green')

      const canvas = screen.getByTestId('canvas-container')
      // Fire pointerDown directly on the canvas (not on a child panel)
      fireEvent.pointerDown(canvas)

      expect(useCanvasStore.getState().focusModePanelId).toBeNull()
    })

    it('opacity transition is included in transition style', () => {
      seedPanels()
      render(<CanvasEngine />)

      const redPanel = screen.getByTestId('panel-red')
      const transition = redPanel.style.transition
      expect(transition).toContain('opacity')
    })
  })

  describe('fullscreen', () => {
    it('renders a fullscreen toggle button in panel chrome', () => {
      useCanvasStore.getState().addPanel({
        id: 'fs-test',
        pos_x: 0,
        pos_y: 0,
        width: 200,
        height: 200,
        z_index: 1,
        title: 'Fullscreen Test',
      })
      render(<CanvasEngine />)
      expect(screen.getByTestId('panel-fullscreen-fs-test')).toBeInTheDocument()
    })

    it('fullscreen button has correct aria-label', () => {
      useCanvasStore.getState().addPanel({
        id: 'fs-test',
        pos_x: 0,
        pos_y: 0,
        width: 200,
        height: 200,
        z_index: 1,
        title: 'My Panel',
      })
      render(<CanvasEngine />)
      expect(screen.getByLabelText('Fullscreen My Panel')).toBeInTheDocument()
    })

    it('disables resize handles when panel is fullscreen', () => {
      useCanvasStore.getState().addPanel({
        id: 'fs-test',
        pos_x: 10,
        pos_y: 20,
        width: 200,
        height: 200,
        z_index: 1,
      })
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFullscreen('fs-test', 800, 600)
      })

      const panel = screen.getByTestId('panel-fs-test')
      // Even if hovered, handles should be disabled in fullscreen
      fireEvent.mouseEnter(panel)
      const handlesContainer = screen.getByTestId('resize-handles-fs-test')
      expect(handlesContainer.style.pointerEvents).toBe('none')
    })
  })

  describe('clicking dimmed panel switches focus', () => {
    it('switches focus mode to the clicked dimmed panel', () => {
      seedPanels()
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFocusMode('green')
      })

      // red is dimmed — clicking it should switch focus to red
      const redPanel = screen.getByTestId('panel-red')
      fireEvent.pointerDown(redPanel)

      expect(useCanvasStore.getState().focusModePanelId).toBe('red')
    })

    it('does not change focus mode when clicking the already-focused panel', () => {
      seedPanels()
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFocusMode('green')
      })

      // green is focused (not dimmed) — clicking it should not change focus
      const greenPanel = screen.getByTestId('panel-green')
      fireEvent.pointerDown(greenPanel)

      expect(useCanvasStore.getState().focusModePanelId).toBe('green')
    })
  })
})
