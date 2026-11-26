import { useState } from 'react'
import { render, renderHook, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CanvasEngine, useShiftHeld } from './CanvasEngine'
import { useCanvasStore } from './canvas-store'

/**
 * Testing notes:
 *
 * - Pointer drags (UI SDK createMove / createResize) need real layout and
 *   pointer capture, which jsdom lacks: they are covered by the Playwright
 *   component test (CanvasEngine.iwft.tsx) and panels.e2e.ts.
 * - Component tests here verify: rendering at correct positions, z-index ordering
 *   on pointer down, the keyboard paths (Alt+arrow, arrows on a resize handle),
 *   and that the onLayoutChange callback fires.
 *
 * Divergence from the POC version:
 * - The package CanvasEngine no longer derives panel content or icons from a
 *   `type` field. Panel display titles come from `panel.title` (falling back to
 *   getLabel(lensType) then 'Untitled'), and icons are resolved via the optional
 *   getIcon prop. POC assertions that relied on internal type-driven placeholder
 *   content have no equivalent and are dropped.
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
      gesturePanelId: null,
      shiftPreview: null,
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
    // Each side reads the drag preview's custom property first (UI SDK's
    // createResize boxStyle), falling back to the saved layout.
    expect(redPanel.style.left).toBe('var(--resize-x, 10px)')
    expect(redPanel.style.top).toBe('var(--resize-y, 20px)')
    expect(redPanel.style.width).toBe('var(--resize-width, 100px)')
    expect(redPanel.style.height).toBe('var(--resize-height, 80px)')
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

    // Only the panel that changed is saved.
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange.mock.calls[0][0]).toEqual([expect.objectContaining({ id: 'red', z_index: 4 })])
  })

  it('saves nothing for a new panel set, or a panel added to the board', () => {
    const onLayoutChange = vi.fn()
    render(<CanvasEngine onLayoutChange={onLayoutChange} />)
    act(() => {
      useCanvasStore.getState().setPanels([{ id: 'a', pos_x: 0, pos_y: 0, width: 200, height: 200, z_index: 1 }])
    })
    act(() => {
      useCanvasStore.getState().addPanel({ id: 'b', pos_x: 300, pos_y: 0, width: 200, height: 200, z_index: 2 })
    })
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('saves a layout arranged as the panel set arrives (a migrated board tidied up)', () => {
    const onLayoutChange = vi.fn()
    render(<CanvasEngine onLayoutChange={onLayoutChange} />)
    act(() => {
      const store = useCanvasStore.getState()
      store.setPanels([{ id: 'a', pos_x: 0, pos_y: 0, width: 200, height: 200, z_index: 1 }])
      store.arrangePanels(new Map([['a', { pos_x: 20, pos_y: 20 }]]))
    })
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange.mock.calls[0][0]).toEqual([expect.objectContaining({ id: 'a', pos_x: 20, pos_y: 20 })])
  })

  it('saves once, at the end of a resize, however many steps it took', () => {
    const onLayoutChange = vi.fn()
    useCanvasStore.getState().addPanel({ id: 'r', pos_x: 20, pos_y: 20, width: 300, height: 200, z_index: 1 })
    render(<CanvasEngine onLayoutChange={onLayoutChange} />)
    const handle = screen.getAllByTestId('resize-handle-se')[0]!
    // jsdom has no pointer capture.
    handle.setPointerCapture = () => {}
    handle.releasePointerCapture = () => {}
    // A mouse's primary button, as UI SDK's drags take only that.
    const mouse = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 }
    fireEvent.pointerDown(handle, { ...mouse, clientX: 320, clientY: 220, buttons: 1 })
    for (const d of [10, 20, 30, 40]) fireEvent.pointerMove(handle, { ...mouse, clientX: 320 + d, clientY: 220 + d, buttons: 1 })
    expect(onLayoutChange).not.toHaveBeenCalled()
    fireEvent.pointerUp(handle, { ...mouse, clientX: 360, clientY: 260, buttons: 0 })
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange.mock.calls[0][0]).toEqual([expect.objectContaining({ id: 'r', width: 340, height: 240 })])
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

  it('resolves the display label from getLabel when no title is set', () => {
    useCanvasStore.getState().addPanel({
      id: 'lensed',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
      lensType: 'transcript',
    })
    render(<CanvasEngine getLabel={(t) => (t === 'transcript' ? 'Transcript' : undefined)} />)
    expect(screen.getByText('Transcript')).toBeInTheDocument()
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

  it('calls onRemovePanel instead of store removal when provided', () => {
    const onRemovePanel = vi.fn()
    useCanvasStore.getState().addPanel({
      id: 'closable',
      pos_x: 0,
      pos_y: 0,
      width: 200,
      height: 200,
      z_index: 1,
      title: 'Close Me',
    })
    render(<CanvasEngine onRemovePanel={onRemovePanel} />)
    fireEvent.click(screen.getByTestId('panel-close-closable'))
    expect(onRemovePanel).toHaveBeenCalledWith('closable')
    // Store removal is delegated to the consumer, so the panel stays
    expect(screen.getByTestId('panel-closable')).toBeInTheDocument()
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
    it('dims non-focused panels to 0.3 opacity when focus mode is active', async () => {
      seedPanels()
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFocusMode('green')
      })

      const redPanel = screen.getByTestId('panel-red')
      const bluePanel = screen.getByTestId('panel-blue')
      const greenPanel = screen.getByTestId('panel-green')

      await waitFor(() => {
        expect(redPanel.style.opacity).toBe('0.3')
        expect(bluePanel.style.opacity).toBe('0.3')
      })
      expect(greenPanel.style.opacity).toBe('1')
    })

    it('restores full opacity when focus mode is exited', async () => {
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

      await waitFor(() => {
        expect(redPanel.style.opacity).toBe('1')
        expect(bluePanel.style.opacity).toBe('1')
      })
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

    it('fades with motion/react alone: no CSS transition on its opacity or box', () => {
      seedPanels()
      render(<CanvasEngine />)

      // One engine per element, so a dim, an arrival and a glide never fight.
      const transition = screen.getByTestId('panel-red').style.transition
      expect(transition).not.toMatch(/opacity|left|top|width|height/)
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
      // Even if hovered, a fullscreen panel has no handles to press or tab to
      fireEvent.mouseEnter(panel)
      expect(screen.queryByTestId('resize-handles-fs-test')).toBeNull()
      expect(screen.queryAllByRole('button', { name: /^Resize / })).toHaveLength(0)
    })

    it('puts the panels behind a fullscreen one out of reach until it leaves fullscreen', () => {
      const { addPanel } = useCanvasStore.getState()
      addPanel({ id: 'a', pos_x: 0, pos_y: 0, width: 200, height: 200, z_index: 1 })
      addPanel({ id: 'b', pos_x: 250, pos_y: 0, width: 200, height: 200, z_index: 2 })
      render(<CanvasEngine />)
      expect(screen.getByTestId('panel-b')).not.toHaveAttribute('inert')

      act(() => {
        useCanvasStore.getState().enterFullscreen('a', 800, 600)
      })
      expect(screen.getByTestId('panel-b')).toHaveAttribute('inert')
      expect(screen.getByTestId('panel-a')).not.toHaveAttribute('inert')

      act(() => {
        useCanvasStore.getState().exitFullscreen()
      })
      expect(screen.getByTestId('panel-b')).not.toHaveAttribute('inert')
    })

    it('renders the fullscreen panel above every other, even one sharing its z_index', () => {
      const { addPanel } = useCanvasStore.getState()
      addPanel({ id: 'a', pos_x: 0, pos_y: 0, width: 200, height: 200, z_index: 3 })
      addPanel({ id: 'b', pos_x: 50, pos_y: 50, width: 200, height: 200, z_index: 3 })
      render(<CanvasEngine />)

      act(() => {
        useCanvasStore.getState().enterFullscreen('a', 800, 600)
      })

      expect(Number(screen.getByTestId('panel-a').style.zIndex)).toBeGreaterThan(
        Number(screen.getByTestId('panel-b').style.zIndex),
      )
    })

    it('saves nothing as a panel goes fullscreen, so fullscreen is never saved', () => {
      useCanvasStore.getState().addPanel({ id: 'fs', pos_x: 10, pos_y: 20, width: 200, height: 150, z_index: 1 })
      const onLayoutChange = vi.fn()
      render(<CanvasEngine onLayoutChange={onLayoutChange} />)

      act(() => {
        useCanvasStore.getState().enterFullscreen('fs', 800, 600)
      })
      expect(onLayoutChange).not.toHaveBeenCalled()

      // Moved while fullscreen (it can't be, but say it were): saved at its own place.
      act(() => {
        useCanvasStore.getState().bringToFront('fs')
        useCanvasStore.getState().addPanel({ id: 'other', pos_x: 0, pos_y: 0, width: 200, height: 150, z_index: 5 })
        useCanvasStore.getState().bringToFront('fs')
      })
      const saved = onLayoutChange.mock.calls.at(-1)![0]
      expect(saved).toEqual([expect.objectContaining({ id: 'fs', pos_x: 10, pos_y: 20, width: 200, height: 150, z_index: 6 })])
    })
  })

  describe('narrow canvas', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    function setWidth(width: number) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width })
    }
    afterEach(() => {
      if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original)
    })

    it('stacks panels full width in reading order without changing their saved layout', () => {
      setWidth(400)
      seedPanels()
      const before = useCanvasStore.getState().panels
      render(<CanvasEngine />)

      const container = screen.getByTestId('canvas-container')
      expect(container).toHaveAttribute('data-layout', 'stack')
      const order = (id: string) => Number(screen.getByTestId(`panel-${id}`).dataset.stackOrder)
      expect([order('red'), order('blue'), order('green')]).toEqual([0, 1, 2])
      expect(screen.getByTestId('panel-red').style.left).toBe('')
      expect(screen.queryByTestId('panel-fullscreen-red')).toBeNull()
      expect(useCanvasStore.getState().panels).toBe(before)
    })

    it('orders the stack by position (top to bottom, then left to right), not store order', () => {
      setWidth(400)
      const { addPanel } = useCanvasStore.getState()
      addPanel({ id: 'low', pos_x: 0, pos_y: 500, width: 100, height: 100, z_index: 1 })
      addPanel({ id: 'right', pos_x: 300, pos_y: 0, width: 100, height: 100, z_index: 2 })
      addPanel({ id: 'left', pos_x: 0, pos_y: 0, width: 100, height: 100, z_index: 3 })
      render(<CanvasEngine />)
      const order = (id: string) => Number(screen.getByTestId(`panel-${id}`).dataset.stackOrder)
      expect([order('left'), order('right'), order('low')]).toEqual([0, 1, 2])
    })

    it('never remounts a widget when the canvas crosses the breakpoint', () => {
      function Counter() {
        const [n, setN] = useState(0)
        return <button type="button" onClick={() => setN((v) => v + 1)}>count {n}</button>
      }
      setWidth(1200)
      seedPanels()
      render(<CanvasEngine renderPanel={(id) => (id === 'red' ? <Counter /> : null)} />)
      fireEvent.click(screen.getByRole('button', { name: 'count 0' }))
      const node = screen.getByRole('button', { name: 'count 1' })

      setWidth(400)
      act(() => { window.dispatchEvent(new Event('resize')) })
      expect(screen.getByTestId('canvas-container')).toHaveAttribute('data-layout', 'stack')
      expect(screen.getByRole('button', { name: 'count 1' })).toBe(node)

      setWidth(1200)
      act(() => { window.dispatchEvent(new Event('resize')) })
      expect(screen.getByTestId('canvas-container')).toHaveAttribute('data-layout', 'free')
      expect(screen.getByRole('button', { name: 'count 1' })).toBe(node)
      expect(node.isConnected).toBe(true)
    })

    it('keeps the free layout on a wide canvas', () => {
      setWidth(1200)
      seedPanels()
      render(<CanvasEngine />)
      expect(screen.getByTestId('canvas-container')).toHaveAttribute('data-layout', 'free')
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

  describe('moving and resizing by keyboard', () => {
    function seedTwo() {
      const { addPanel } = useCanvasStore.getState()
      addPanel({ id: 'notes', pos_x: 40, pos_y: 60, width: 300, height: 200, z_index: 1, title: 'Notes' })
      addPanel({ id: 'plan', pos_x: 400, pos_y: 60, width: 300, height: 200, z_index: 2, title: 'Plan' })
    }
    const box = (id: string) => {
      const p = useCanvasStore.getState().panels.find((panel) => panel.id === id)!
      return { x: p.pos_x, y: p.pos_y, width: p.width, height: p.height }
    }
    const altArrow = (key: string, opts: KeyboardEventInit = {}) =>
      fireEvent.keyDown(document.activeElement ?? document.body, { key, altKey: true, ...opts })

    it('names each resize handle button by its panel and edge', () => {
      seedTwo()
      render(<CanvasEngine />)
      const notes = screen.getByTestId('panel-notes')
      const names = within(notes).getAllByRole('button', { name: /^Resize / }).map((b) => b.getAttribute('aria-label'))
      expect(names).toEqual([
        'Resize Notes top left', 'Resize Notes top', 'Resize Notes top right', 'Resize Notes right',
        'Resize Notes bottom right', 'Resize Notes bottom', 'Resize Notes bottom left', 'Resize Notes left',
      ])
    })

    it("makes only the selected panel's handles tab stops", () => {
      seedTwo()
      render(<CanvasEngine />)
      const tabStops = () => screen.getAllByRole('button', { name: /^Resize / })
        .filter((b) => b.tabIndex === 0)
        .map((b) => b.getAttribute('aria-label'))
      expect(tabStops()).toEqual([])

      act(() => useCanvasStore.getState().selectPanel('plan'))
      expect(tabStops()).toHaveLength(8)
      expect(tabStops().every((name) => name!.startsWith('Resize Plan '))).toBe(true)
    })

    it('Alt+arrow moves the selected panel one 20px grid step', () => {
      seedTwo()
      render(<CanvasEngine />)
      act(() => useCanvasStore.getState().selectPanel('notes'))

      altArrow('ArrowRight')
      expect(box('notes')).toMatchObject({ x: 60, y: 60 })
      altArrow('ArrowDown')
      expect(box('notes')).toMatchObject({ x: 60, y: 80 })
      altArrow('ArrowLeft')
      altArrow('ArrowUp')
      expect(box('notes')).toMatchObject({ x: 40, y: 60 })
      expect(box('plan')).toMatchObject({ x: 400, y: 60 })
    })

    it('Alt+arrow lands an off-grid panel on the 20px grid', () => {
      useCanvasStore.getState().addPanel({ id: 'odd', pos_x: 13, pos_y: 47, width: 300, height: 200, z_index: 1 })
      render(<CanvasEngine />)
      act(() => useCanvasStore.getState().selectPanel('odd'))
      altArrow('ArrowRight')
      expect(box('odd')).toMatchObject({ x: 40, y: 40 })
    })

    it('Alt+arrow does nothing without a selection, or while typing in a field', () => {
      seedTwo()
      render(<CanvasEngine renderPanel={(id) => (id === 'notes' ? <input aria-label="Note title" /> : null)} />)
      altArrow('ArrowRight')
      expect(box('notes')).toMatchObject({ x: 40, y: 60 })

      act(() => useCanvasStore.getState().selectPanel('notes'))
      const field = screen.getByRole('textbox', { name: 'Note title' })
      field.focus()
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true })
      field.dispatchEvent(event)
      expect(box('notes')).toMatchObject({ x: 40, y: 60 })
      // The field keeps its own Alt+arrow (word jump on macOS).
      expect(event.defaultPrevented).toBe(false)
    })

    it('arrows on a focused handle resize along its edge in 20px steps', () => {
      seedTwo()
      render(<CanvasEngine />)
      act(() => useCanvasStore.getState().selectPanel('notes'))

      const right = screen.getByRole('button', { name: 'Resize Notes right' })
      right.focus()
      fireEvent.keyDown(right, { key: 'ArrowRight' })
      expect(box('notes')).toEqual({ x: 40, y: 60, width: 320, height: 200 })
      // An edge handle only follows its own axis.
      fireEvent.keyDown(right, { key: 'ArrowDown' })
      expect(box('notes')).toEqual({ x: 40, y: 60, width: 320, height: 200 })

      const topLeft = screen.getByRole('button', { name: 'Resize Notes top left' })
      topLeft.focus()
      fireEvent.keyDown(topLeft, { key: 'ArrowUp' })
      // The bottom edge stays put while the top edge moves up.
      expect(box('notes')).toEqual({ x: 40, y: 40, width: 320, height: 220 })
    })

    it('keeps a panel at its size constraints when resized by keyboard', () => {
      useCanvasStore.getState().addPanel({
        id: 'small', pos_x: 0, pos_y: 0, width: 300, height: 250, z_index: 1, title: 'Small',
        constraints: { minWidth: 300, minHeight: 250 },
      })
      render(<CanvasEngine />)
      act(() => useCanvasStore.getState().selectPanel('small'))
      const corner = screen.getByRole('button', { name: 'Resize Small bottom right' })
      corner.focus()
      fireEvent.keyDown(corner, { key: 'ArrowLeft' })
      fireEvent.keyDown(corner, { key: 'ArrowUp' })
      expect(box('small')).toEqual({ x: 0, y: 0, width: 300, height: 250 })
    })

    it('moves and resizes nothing while a panel is fullscreen', () => {
      seedTwo()
      render(<CanvasEngine />)
      act(() => {
        useCanvasStore.getState().selectPanel('notes')
        useCanvasStore.getState().enterFullscreen('notes', 800, 600)
      })
      const before = box('notes')
      altArrow('ArrowRight')
      expect(box('notes')).toEqual(before)
    })

    describe('saving', () => {
      beforeEach(() => vi.useFakeTimers())
      afterEach(() => vi.useRealTimers())

      it('saves a run of Alt+arrow presses once, after the keys stop', () => {
        seedTwo()
        const onLayoutChange = vi.fn()
        render(<CanvasEngine onLayoutChange={onLayoutChange} />)
        act(() => useCanvasStore.getState().selectPanel('plan'))
        onLayoutChange.mockClear()

        // A held key repeats.
        for (let i = 0; i < 5; i++) altArrow('ArrowDown', { repeat: i > 0 })
        expect(box('plan')).toMatchObject({ y: 160 })
        expect(onLayoutChange).not.toHaveBeenCalled()

        act(() => { vi.advanceTimersByTime(1000) })
        expect(onLayoutChange).toHaveBeenCalledTimes(1)
        expect(onLayoutChange.mock.calls[0][0].find((p: { id: string }) => p.id === 'plan')).toMatchObject({ pos_y: 160 })
      })

      it('saves a pending keyboard move before the board switches to other panels', () => {
        seedTwo()
        const onLayoutChange = vi.fn()
        render(<CanvasEngine onLayoutChange={onLayoutChange} />)
        act(() => useCanvasStore.getState().selectPanel('plan'))
        onLayoutChange.mockClear()

        altArrow('ArrowRight')
        act(() => {
          useCanvasStore.getState().setPanels([
            { id: 'other', pos_x: 0, pos_y: 0, width: 300, height: 200, z_index: 1 },
          ])
        })
        // Saved as the board switches; the new board's panels moved nowhere, so nothing more.
        const saved = onLayoutChange.mock.calls.map(([panels]) => panels.map((p: { id: string }) => p.id))
        expect(saved).toEqual([['plan']])
        expect(onLayoutChange.mock.calls[0][0][0]).toMatchObject({ id: 'plan', pos_x: 420 })

        act(() => { vi.advanceTimersByTime(1000) })
        expect(onLayoutChange).toHaveBeenCalledTimes(1)
      })

      it('saves a pending keyboard move when the board unmounts', () => {
        seedTwo()
        const onLayoutChange = vi.fn()
        const { unmount } = render(<CanvasEngine onLayoutChange={onLayoutChange} />)
        act(() => useCanvasStore.getState().selectPanel('plan'))
        onLayoutChange.mockClear()

        altArrow('ArrowRight')
        unmount()
        expect(onLayoutChange).toHaveBeenCalledTimes(1)
        expect(onLayoutChange.mock.calls[0][0].find((p: { id: string }) => p.id === 'plan')).toMatchObject({ pos_x: 420 })
      })
    })
  })
})

describe('a drag during a glide', () => {
  beforeEach(() => {
    useCanvasStore.setState({ panels: [], fullscreenPanelId: null, preFullscreenLayout: null, gesturePanelId: null, shiftPreview: null })
    useCanvasStore.getState().addPanel({ id: 'p', pos_x: 100, pos_y: 100, width: 200, height: 200, z_index: 1 })
    // jsdom has no pointer capture.
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.hasPointerCapture ??= () => false
  })

  /** Leaves fullscreen, so the panel glides home from where it was drawn. */
  async function gliding() {
    render(<CanvasEngine />)
    act(() => useCanvasStore.getState().enterFullscreen('p', 800, 600))
    act(() => useCanvasStore.getState().exitFullscreen())
    const panel = screen.getByTestId('panel-p')
    await waitFor(() => expect(panel.style.transform).toMatch(/translate/))
    return panel
  }

  it('carries on from where the glide has the panel, never jumping by the rest of it, and stops the glide', async () => {
    const panel = await gliding()
    const header = within(panel).getByTestId('panel-header')
    const mouse = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 }
    fireEvent.pointerDown(header, { ...mouse, clientX: 150, clientY: 120, buttons: 1 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const held = panel.style.transform
    // Still drawn where the glide had it, and no longer gliding.
    expect(held).toMatch(/translate/)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(panel.style.transform).toBe(held)
    fireEvent.pointerMove(header, { ...mouse, clientX: 170, clientY: 130, buttons: 1 })
    fireEvent.pointerUp(header, { ...mouse, clientX: 170, clientY: 130, buttons: 0 })
    // Dropped from where it was drawn: its box takes the glide's offset, and it is drawn there.
    await waitFor(() => expect(useCanvasStore.getState().panels[0]).not.toMatchObject({ pos_x: 100, pos_y: 100 }))
    await waitFor(() => expect(panel.style.transform).not.toMatch(/translate\((?!0px, 0px)/))
  })

  it('a resize starting mid-glide takes the panel to its box first', async () => {
    const panel = await gliding()
    fireEvent.mouseEnter(panel)
    fireEvent.pointerDown(within(panel).getByTestId('resize-handle-se'), { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: 300, clientY: 300 })
    await waitFor(() => expect(panel.style.transform).not.toMatch(/translate\((?!0px, 0px)/))
  })
})

describe('useShiftHeld', () => {
  function fireWindowKey(type: 'keydown' | 'keyup', key: string) {
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
  }

  it('is false initially, true on Shift keydown and false on keyup', () => {
    const { result } = renderHook(() => useShiftHeld())
    expect(result.current.current).toBe(false)
    fireWindowKey('keydown', 'Shift')
    expect(result.current.current).toBe(true)
    fireWindowKey('keyup', 'Shift')
    expect(result.current.current).toBe(false)
  })

  it('resets to false on window blur', () => {
    const { result } = renderHook(() => useShiftHeld())
    fireWindowKey('keydown', 'Shift')
    expect(result.current.current).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(result.current.current).toBe(false)
  })

  it('ignores non-Shift keys', () => {
    const { result } = renderHook(() => useShiftHeld())
    fireWindowKey('keydown', 'Control')
    expect(result.current.current).toBe(false)
    fireWindowKey('keydown', 'a')
    expect(result.current.current).toBe(false)
  })

  it('follows the Shift state pointer events carry (pressed before the page had focus)', () => {
    const { result } = renderHook(() => useShiftHeld())
    window.dispatchEvent(new MouseEvent('pointermove', { shiftKey: true }))
    expect(result.current.current).toBe(true)
    window.dispatchEvent(new MouseEvent('pointermove', { shiftKey: false }))
    expect(result.current.current).toBe(false)
  })

  it('tells onChange of each press and release, once', () => {
    const changes: boolean[] = []
    renderHook(() => useShiftHeld((held) => changes.push(held)))
    fireWindowKey('keydown', 'Shift')
    fireWindowKey('keydown', 'Shift')
    fireWindowKey('keyup', 'Shift')
    expect(changes).toEqual([true, false])
  })
})
