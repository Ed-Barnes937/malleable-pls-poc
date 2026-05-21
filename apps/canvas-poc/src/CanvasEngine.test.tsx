import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CanvasEngine } from './CanvasEngine'
import { useCanvasStore } from './canvas-store'

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
    useCanvasStore.setState({ panels: [] })
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

  it('applies background colour from panel meta', () => {
    useCanvasStore.getState().addPanel({
      id: 'coloured',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
      meta: { colour: 'rgb(255, 100, 50)' },
    })
    render(<CanvasEngine />)
    const panel = screen.getByTestId('panel-coloured')
    expect(panel.style.backgroundColor).toBe('rgb(255, 100, 50)')
  })

  it('displays panel id as label', () => {
    useCanvasStore.getState().addPanel({
      id: 'labelled',
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      z_index: 1,
    })
    render(<CanvasEngine />)
    expect(screen.getByText('labelled')).toBeInTheDocument()
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
})
