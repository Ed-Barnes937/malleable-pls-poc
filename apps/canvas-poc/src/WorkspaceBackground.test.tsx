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
    it('both color layers are transparent', () => {
      render(<WorkspaceBackground />)
      const layerA = screen.getByTestId('workspace-bg-color-layer-a')
      const layerB = screen.getByTestId('workspace-bg-color-layer-b')
      // One layer will be transparent with opacity 1, the other transparent with opacity 0
      // Either way, visually both are transparent
      expect(layerA.style.background).toBe('transparent')
      expect(layerB.style.background).toBe('transparent')
    })

    it('image layer has opacity 0', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.opacity).toBe('0')
    })
  })

  describe('solid background', () => {
    it('applies solid color to one of the color layers at full opacity', () => {
      useCanvasStore.setState({ background: { type: 'solid', value: 'oklch(0.85 0.04 75)' } })
      render(<WorkspaceBackground />)
      const layerA = screen.getByTestId('workspace-bg-color-layer-a')
      const layerB = screen.getByTestId('workspace-bg-color-layer-b')

      // Exactly one layer should have the solid color with opacity 1
      const activeLayer =
        layerA.style.background === 'oklch(0.85 0.04 75)' ? layerA : layerB
      const inactiveLayer = activeLayer === layerA ? layerB : layerA

      expect(activeLayer.style.background).toBe('oklch(0.85 0.04 75)')
      expect(activeLayer.style.opacity).toBe('1')
      expect(inactiveLayer.style.background).toBe('transparent')
      expect(inactiveLayer.style.opacity).toBe('0')
    })

    it('image layer remains at opacity 0', () => {
      useCanvasStore.setState({ background: { type: 'solid', value: 'oklch(0.85 0.04 75)' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.opacity).toBe('0')
    })
  })

  describe('gradient background', () => {
    it('applies gradient to one of the color layers at full opacity', () => {
      const gradient = 'linear-gradient(135deg, oklch(0.78 0.08 55), oklch(0.65 0.10 25))'
      useCanvasStore.setState({ background: { type: 'gradient', value: gradient } })
      render(<WorkspaceBackground />)
      const layerA = screen.getByTestId('workspace-bg-color-layer-a')
      const layerB = screen.getByTestId('workspace-bg-color-layer-b')

      // One layer should contain the gradient and be visible
      const activeLayer =
        layerA.style.background.includes('linear-gradient') ? layerA : layerB

      expect(activeLayer.style.background).toContain('linear-gradient')
      expect(activeLayer.style.background).toContain('oklch')
      expect(activeLayer.style.opacity).toBe('1')
    })
  })

  describe('image background', () => {
    it('sets background-image on the image layer with quoted URL', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.backgroundImage).toContain('https://example.com/bg.jpg')
    })

    it('sets image layer opacity to 1', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.opacity).toBe('1')
    })

    it('both color layers are transparent for image backgrounds', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layerA = screen.getByTestId('workspace-bg-color-layer-a')
      const layerB = screen.getByTestId('workspace-bg-color-layer-b')
      expect(layerA.style.background).toBe('transparent')
      expect(layerB.style.background).toBe('transparent')
    })

    it('image layer has background-size: cover', () => {
      useCanvasStore.setState({ background: { type: 'image', value: 'https://example.com/bg.jpg' } })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.backgroundSize).toBe('cover')
    })

    it('sanitises dangerous characters from image URLs', () => {
      useCanvasStore.setState({
        background: { type: 'image', value: 'https://example.com/bg.jpg"\\onerror=alert(1)' },
      })
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      // The double-quote and backslash should be stripped
      expect(layer.style.backgroundImage).not.toContain('"\\')
      expect(layer.style.backgroundImage).toContain('https://example.com/bg.jpg')
    })
  })

  describe('transitions', () => {
    it('color layer A has 300ms ease-out opacity transition', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-color-layer-a')
      expect(layer.style.transition).toBe('opacity 300ms ease-out')
    })

    it('color layer B has 300ms ease-out opacity transition', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-color-layer-b')
      expect(layer.style.transition).toBe('opacity 300ms ease-out')
    })

    it('image layer has 300ms ease-out transition on opacity', () => {
      render(<WorkspaceBackground />)
      const layer = screen.getByTestId('workspace-bg-image-layer')
      expect(layer.style.transition).toBe('opacity 300ms ease-out')
    })
  })
})
