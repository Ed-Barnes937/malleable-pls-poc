import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { App } from './App'
import { useCanvasStore } from './canvas-store'

describe('TopBar + DrawerSidebar integration', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    useCanvasStore.setState({ panels: [] })
  })

  describe('drawer toggle', () => {
    it('drawer is closed by default', () => {
      render(<App />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.transform).toBe('translateX(-100%)')
      expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
    })

    it('opens drawer when hamburger is clicked', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('drawer-trigger'))
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.transform).toBe('translateX(0)')
      expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument()
    })

    it('closes drawer when backdrop is clicked', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('drawer-trigger'))
      expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument()

      await userEvent.click(screen.getByTestId('drawer-backdrop'))
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.transform).toBe('translateX(-100%)')
      expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
    })

    it('toggles drawer closed on second hamburger click', async () => {
      render(<App />)
      const trigger = screen.getByTestId('drawer-trigger')

      await userEvent.click(trigger)
      expect(screen.getByTestId('drawer-sidebar').style.transform).toBe('translateX(0)')

      await userEvent.click(trigger)
      expect(screen.getByTestId('drawer-sidebar').style.transform).toBe('translateX(-100%)')
    })

    it('closes drawer when Escape key is pressed', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('drawer-trigger'))
      expect(screen.getByTestId('drawer-sidebar').style.transform).toBe('translateX(0)')

      await userEvent.keyboard('{Escape}')
      expect(screen.getByTestId('drawer-sidebar').style.transform).toBe('translateX(-100%)')
      expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
    })

    it('focuses drawer sidebar when opened', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('drawer-trigger'))
      expect(document.activeElement).toBe(screen.getByTestId('drawer-sidebar'))
    })
  })

  describe('add panel button', () => {
    it('adds a new panel to the store when clicked', async () => {
      render(<App />)
      const initialCount = useCanvasStore.getState().panels.length

      await userEvent.click(screen.getByTestId('add-panel-button'))

      const panels = useCanvasStore.getState().panels
      expect(panels.length).toBe(initialCount + 1)
    })

    it('new panel has a unique id', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('add-panel-button'))
      await userEvent.click(screen.getByTestId('add-panel-button'))

      const panels = useCanvasStore.getState().panels
      const ids = panels.map((p) => p.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('new panel has a valid type from LENS_PALETTE', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('add-panel-button'))

      const panels = useCanvasStore.getState().panels
      const newPanel = panels[panels.length - 1]
      const validTypes = ['document', 'audio', 'tags', 'chart', 'image', 'note', 'transcript']
      expect(validTypes).toContain(newPanel.type)
    })

    it('new panel has correct default dimensions', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('add-panel-button'))

      const panels = useCanvasStore.getState().panels
      const newPanel = panels[panels.length - 1]
      expect(newPanel.width).toBe(280)
      expect(newPanel.height).toBe(220)
    })

    it('new panel z_index is above existing panels', async () => {
      useCanvasStore.getState().addPanel({
        id: 'existing',
        pos_x: 0,
        pos_y: 0,
        width: 200,
        height: 200,
        z_index: 5,
      })

      render(<App />)
      await userEvent.click(screen.getByTestId('add-panel-button'))

      const panels = useCanvasStore.getState().panels
      const newPanel = panels[panels.length - 1]
      expect(newPanel.z_index).toBeGreaterThan(5)
    })
  })

  describe('drag-to-canvas', () => {
    it('canvas drop zone renders', () => {
      render(<App />)
      expect(screen.getByTestId('canvas-drop-zone')).toBeInTheDocument()
    })

    it('canvas accepts dragover with lens data', () => {
      render(<App />)
      const dropZone = screen.getByTestId('canvas-drop-zone')

      const event = new Event('dragover', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: ['application/x-lens-type'],
          dropEffect: '',
        },
      })

      const prevented = !dropZone.dispatchEvent(event)
      expect(prevented).toBe(true)
    })

    it('creates a panel on drop with lens type data', () => {
      render(<App />)
      const dropZone = screen.getByTestId('canvas-drop-zone')
      const initialCount = useCanvasStore.getState().panels.length

      // Simulate drop with lens data
      const dataStore: Record<string, string> = {
        'application/x-lens-type': 'audio',
        'application/x-lens-label': 'Audio',
      }

      fireEvent.drop(dropZone, {
        dataTransfer: {
          getData: (key: string) => dataStore[key] ?? '',
          types: ['application/x-lens-type', 'application/x-lens-label'],
        },
        clientX: 400,
        clientY: 300,
      })

      const panels = useCanvasStore.getState().panels
      expect(panels.length).toBe(initialCount + 1)

      const newPanel = panels[panels.length - 1]
      expect(newPanel.type).toBe('audio')
      expect(newPanel.title).toBe('Audio')
      expect(newPanel.width).toBe(280)
      expect(newPanel.height).toBe(220)
    })

    it('dropped panel has unique id', () => {
      render(<App />)
      const dropZone = screen.getByTestId('canvas-drop-zone')

      const dataStore: Record<string, string> = {
        'application/x-lens-type': 'note',
        'application/x-lens-label': 'Note',
      }

      fireEvent.drop(dropZone, {
        dataTransfer: {
          getData: (key: string) => dataStore[key] ?? '',
          types: ['application/x-lens-type'],
        },
        clientX: 100,
        clientY: 100,
      })

      fireEvent.drop(dropZone, {
        dataTransfer: {
          getData: (key: string) => dataStore[key] ?? '',
          types: ['application/x-lens-type'],
        },
        clientX: 200,
        clientY: 200,
      })

      const panels = useCanvasStore.getState().panels
      const ids = panels.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('does not create panel when drop has no lens type', () => {
      render(<App />)
      const dropZone = screen.getByTestId('canvas-drop-zone')
      const initialCount = useCanvasStore.getState().panels.length

      fireEvent.drop(dropZone, {
        dataTransfer: {
          getData: () => '',
          types: [],
        },
      })

      expect(useCanvasStore.getState().panels.length).toBe(initialCount)
    })

    it('dropped panel z_index is above existing panels', () => {
      useCanvasStore.getState().addPanel({
        id: 'existing',
        pos_x: 0,
        pos_y: 0,
        width: 200,
        height: 200,
        z_index: 10,
      })

      render(<App />)
      const dropZone = screen.getByTestId('canvas-drop-zone')

      fireEvent.drop(dropZone, {
        dataTransfer: {
          getData: (key: string) =>
            key === 'application/x-lens-type' ? 'chart' : 'Chart',
          types: ['application/x-lens-type'],
        },
        clientX: 300,
        clientY: 300,
      })

      const panels = useCanvasStore.getState().panels
      const newPanel = panels[panels.length - 1]
      expect(newPanel.z_index).toBeGreaterThan(10)
    })
  })

  describe('lens palette in drawer', () => {
    it('drawer contains all 6 lens items when open', async () => {
      render(<App />)
      await userEvent.click(screen.getByTestId('drawer-trigger'))

      expect(screen.getByTestId('lens-item-document')).toBeInTheDocument()
      expect(screen.getByTestId('lens-item-audio')).toBeInTheDocument()
      expect(screen.getByTestId('lens-item-tags')).toBeInTheDocument()
      expect(screen.getByTestId('lens-item-chart')).toBeInTheDocument()
      expect(screen.getByTestId('lens-item-image')).toBeInTheDocument()
      expect(screen.getByTestId('lens-item-note')).toBeInTheDocument()
    })
  })
})
