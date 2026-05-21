import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { DrawerSidebar, LENS_PALETTE } from './DrawerSidebar'

describe('DrawerSidebar', () => {
  describe('closed state', () => {
    it('renders the drawer sidebar element', () => {
      render(<DrawerSidebar open={false} onClose={vi.fn()} />)
      expect(screen.getByTestId('drawer-sidebar')).toBeInTheDocument()
    })

    it('is translated off-screen when closed', () => {
      render(<DrawerSidebar open={false} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.transform).toBe('translateX(-100%)')
    })

    it('does not render backdrop when closed', () => {
      render(<DrawerSidebar open={false} onClose={vi.fn()} />)
      expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
    })
  })

  describe('open state', () => {
    it('is positioned on-screen when open', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.transform).toBe('translateX(0)')
    })

    it('renders backdrop when open', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      expect(screen.getByTestId('drawer-backdrop')).toBeInTheDocument()
    })

    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn()
      render(<DrawerSidebar open={true} onClose={onClose} />)
      fireEvent.click(screen.getByTestId('drawer-backdrop'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('uses focused shadow when open', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.boxShadow).toBe('var(--shadow-panel-focused)')
    })

    it('calls onClose when Escape key is pressed', async () => {
      const onClose = vi.fn()
      render(<DrawerSidebar open={true} onClose={onClose} />)
      await userEvent.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose on Escape when closed', async () => {
      const onClose = vi.fn()
      render(<DrawerSidebar open={false} onClose={onClose} />)
      await userEvent.keyboard('{Escape}')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('focuses the aside element when opened', () => {
      const { rerender } = render(<DrawerSidebar open={false} onClose={vi.fn()} />)
      rerender(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(document.activeElement).toBe(sidebar)
    })

    it('restores focus to previously focused element on close', () => {
      const button = document.createElement('button')
      button.textContent = 'Trigger'
      document.body.appendChild(button)
      button.focus()
      expect(document.activeElement).toBe(button)

      const { rerender } = render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      // Focus should move to aside
      expect(document.activeElement).toBe(screen.getByTestId('drawer-sidebar'))

      rerender(<DrawerSidebar open={false} onClose={vi.fn()} />)
      expect(document.activeElement).toBe(button)

      document.body.removeChild(button)
    })
  })

  describe('structure', () => {
    it('renders the drawer header', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      expect(screen.getByTestId('drawer-header')).toBeInTheDocument()
      expect(screen.getByText('Panels')).toBeInTheDocument()
    })

    it('renders the lens palette', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      expect(screen.getByTestId('lens-palette')).toBeInTheDocument()
    })

    it('renders background picker section', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      expect(screen.getByTestId('drawer-background-section')).toBeInTheDocument()
      expect(screen.getByTestId('background-picker')).toBeInTheDocument()
    })

    it('sidebar is positioned fixed', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.position).toBe('fixed')
    })

    it('sidebar has z-index above canvas', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(Number(sidebar.style.zIndex)).toBeGreaterThan(9999)
    })

    it('uses warm surface background', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.background).toBe('var(--color-surface-raised)')
    })

    it('has border-radius on right side only', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const sidebar = screen.getByTestId('drawer-sidebar')
      expect(sidebar.style.borderRadius).toBe('0 var(--radius-panel) var(--radius-panel) 0')
    })
  })

  describe('lens palette', () => {
    it('renders all 6 lens items', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      for (const lens of LENS_PALETTE) {
        expect(screen.getByTestId(`lens-item-${lens.type}`)).toBeInTheDocument()
      }
    })

    it('renders lens labels', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      expect(screen.getByText('Transcript')).toBeInTheDocument()
      expect(screen.getByText('Audio')).toBeInTheDocument()
      expect(screen.getByText('Tags')).toBeInTheDocument()
      expect(screen.getByText('Chart')).toBeInTheDocument()
      expect(screen.getByText('Image')).toBeInTheDocument()
      expect(screen.getByText('Note')).toBeInTheDocument()
    })

    it('lens items are draggable', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      for (const lens of LENS_PALETTE) {
        const item = screen.getByTestId(`lens-item-${lens.type}`)
        expect(item).toHaveAttribute('draggable', 'true')
      }
    })

    it('sets data transfer on drag start', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const documentLens = screen.getByTestId('lens-item-document')

      const dataTransferData: Record<string, string> = {}
      const mockDataTransfer = {
        setData: vi.fn((key: string, val: string) => {
          dataTransferData[key] = val
        }),
        effectAllowed: '',
      }

      fireEvent.dragStart(documentLens, { dataTransfer: mockDataTransfer })

      expect(mockDataTransfer.setData).toHaveBeenCalledWith('application/x-lens-type', 'document')
      expect(mockDataTransfer.setData).toHaveBeenCalledWith('application/x-lens-label', 'Transcript')
      expect(mockDataTransfer.effectAllowed).toBe('copy')
    })

    it('LENS_PALETTE contains expected types', () => {
      const types = LENS_PALETTE.map((l) => l.type)
      expect(types).toContain('document')
      expect(types).toContain('audio')
      expect(types).toContain('tags')
      expect(types).toContain('chart')
      expect(types).toContain('image')
      expect(types).toContain('note')
    })

    it('LENS_PALETTE has 6 entries', () => {
      expect(LENS_PALETTE).toHaveLength(6)
    })

    it('lens palette has accessible label', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      const palette = screen.getByTestId('lens-palette')
      expect(palette).toHaveAttribute('aria-label', 'Panel types')
    })

    it('lens items have role="button" and tabIndex={0}', () => {
      render(<DrawerSidebar open={true} onClose={vi.fn()} />)
      for (const lens of LENS_PALETTE) {
        const item = screen.getByTestId(`lens-item-${lens.type}`)
        expect(item).toHaveAttribute('role', 'button')
        expect(item).toHaveAttribute('tabindex', '0')
      }
    })
  })
})
