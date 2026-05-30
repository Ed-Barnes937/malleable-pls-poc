import { useRef } from 'react'
import { useCanvasStore } from './canvas-store'

/**
 * Sanitise a URL for safe interpolation inside CSS `url("...")`.
 * Strips backslashes and double-quotes to prevent escaping out of the
 * quoted context.
 */
function sanitizeCssUrl(raw: string): string {
  return raw.replace(/["\\]/g, '')
}

/**
 * WorkspaceBackground renders a background layer behind canvas panels.
 *
 * It uses stacked layers with opacity crossfades for all background types:
 * - Solid colors and gradients use two alternating color layers that crossfade
 *   via opacity.
 * - Image URLs use a separate opacity crossfade layer.
 */
export function WorkspaceBackground() {
  const background = useCanvasStore((s) => s.background)

  const isImage = background.type === 'image' && background.value.trim() !== ''
  const isSolidOrGradient = background.type === 'solid' || background.type === 'gradient'

  const prevColorRef = useRef<string>('transparent')
  const flipRef = useRef(false)

  const currentColor = isSolidOrGradient ? background.value : 'transparent'

  if (currentColor !== prevColorRef.current) {
    flipRef.current = !flipRef.current
    prevColorRef.current = currentColor
  }

  const layerAColor = flipRef.current ? currentColor : 'transparent'
  const layerBColor = flipRef.current ? 'transparent' : currentColor
  const layerAOpacity = flipRef.current ? 1 : 0
  const layerBOpacity = flipRef.current ? 0 : 1

  return (
    <div
      data-testid="workspace-background"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        data-testid="workspace-bg-color-layer-a"
        style={{
          position: 'absolute',
          inset: 0,
          background: layerAColor,
          opacity: layerAOpacity,
          transition: 'opacity 300ms ease-out',
        }}
      />
      <div
        data-testid="workspace-bg-color-layer-b"
        style={{
          position: 'absolute',
          inset: 0,
          background: layerBColor,
          opacity: layerBOpacity,
          transition: 'opacity 300ms ease-out',
        }}
      />
      <div
        data-testid="workspace-bg-image-layer"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: isImage
            ? `url("${sanitizeCssUrl(background.value)}")`
            : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: isImage ? 1 : 0,
          transition: 'opacity 300ms ease-out',
        }}
      />
    </div>
  )
}
