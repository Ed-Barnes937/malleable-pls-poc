import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { WorkspaceBackground } from './WorkspaceBackground'
import { useCanvasStore, DEFAULT_BACKGROUND } from './canvas-store'

describe('WorkspaceBackground', () => {
  beforeEach(() => {
    useCanvasStore.setState({ background: DEFAULT_BACKGROUND })
  })

  it('renders the background container', () => {
    render(<WorkspaceBackground />)
    expect(screen.getByTestId('workspace-background')).toBeInTheDocument()
  })

  it('has pointer-events: none so it does not intercept canvas clicks', () => {
    render(<WorkspaceBackground />)
    const bg = screen.getByTestId('workspace-background')
    expect(bg.style.pointerEvents).toBe('none')
  })

  it('is positioned absolutely with inset 0', () => {
    render(<WorkspaceBackground />)
    const bg = screen.getByTestId('workspace-background')
    expect(bg.style.position).toBe('absolute')
    expect(bg.style.inset).toBe('0px')
  })

  it('has z-index 0 (below panels)', () => {
    render(<WorkspaceBackground />)
    const bg = screen.getByTestId('workspace-background')
    expect(bg.style.zIndex).toBe('0')
  })

  describe('none background (default)', () => {
    it('color layer is transparent', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-color-layer')
      expect(layer.style.background).toBe('transparent')
    })

    it('image layer has opacity 0', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.opacity).toBe('0')
    })
  })

  describe('solid background', () => {
    it('applies solid color to the color layer', () => {
      useCanvasStore.setState({ background: { type: 'solid', value: 'oklch(0.85 0.04 75)' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-color-layer')
      expect(layer.style.background).toBe('oklch(0.85 0.04 75)')
    })

    it('image layer remains at opacity 0', () => {
      useCanvasStore.setState({ background: { type: 'solid', value: 'oklch(0.85 0.04 75)' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.opacity).toBe('0')
    })
  })

  describe('gradient background', () => {
    it('applies gradient to the color layer', () => {
      const gradient = 'linear-gradient(135deg, oklch(0.78 0.08 55), oklch(0.65 0.10 25))'
      useCanvasStore.setState({ background: { type: 'gradient', value: gradient } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-color-layer')
      // jsdom may normalize trailing zeroes (0.10 -> 0.1)
      expect(layer.style.background).toContain('linear-gradient')
      expect(layer.style.background).toContain('oklch')
    })
  })

  describe('image background', () => {
    it('sets background-image on the image layer', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      // jsdom may add quotes inside url()
      expect(layer.style.backgroundImage).toContain('https://example.com/bg.jpg')
    })

    it('sets image layer opacity to 1', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.opacity).toBe('1')
    })

    it('color layer is transparent for image backgrounds', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-color-layer')
      expect(layer.style.background).toBe('transparent')
    })

    it('image layer has background-size: cover', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.backgroundSize).toBe('cover')
    })
  })

  describe('transitions', () => {
    it('color layer has 300ms ease-out transition on background', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-color-layer')
      expect(layer.style.transition).toBe('background 300ms ease-out')
    })

    it('image layer has 300ms ease-out transition on opacity', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.transition).toBe('opacity 300ms ease-out')
    })
  })
})
