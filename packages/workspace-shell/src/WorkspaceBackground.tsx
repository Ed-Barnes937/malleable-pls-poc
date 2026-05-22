import { useRef } from 'react'
import { useWorkspaceBackground } from './useWorkspaceBackground'

/**
 * Sanitise a URL for safe interpolation inside CSS `url("...")`.
 * Strips backslashes and double-quotes to prevent escaping out of the
 * quoted context.
 */
function sanitizeCssUrl(raw: string): string {
  return raw.replace(/["\\]/g, '')
}

/**
 * WorkspaceBackground renders a background layer behind the panel area.
 *
 * It uses stacked layers with opacity crossfades for all background types:
 * - Solid colors and gradients use two alternating color layers that crossfade
 *   via opacity. CSS `background` cannot smoothly transition between gradients
 *   or between a solid and a gradient — it snaps instantly. The two-layer
 *   approach works around this by always fading between an opaque layer and a
 *   transparent one.
 * - Image URLs use a separate opacity crossfade layer.
 *
 * The background config is sourced from the active workspace via
 * useWorkspaceBackground (which reads from the DB with optimistic overrides).
 */
export function WorkspaceBackground() {
  const { background } = useWorkspaceBackground()

  const isImage = background.type === 'image' && background.value.trim() !== ''
  const isSolidOrGradient = background.type === 'solid' || background.type === 'gradient'

  // Track the previous color/gradient value so we can crossfade between the
  // old layer (fading out) and the new layer (fading in).
  const prevColorRef = useRef<string>('transparent')
  const flipRef = useRef(false)

  // Determine the current color value
  const currentColor = isSolidOrGradient ? background.value : 'transparent'

  // When the color value changes, flip which layer is "on top"
  if (currentColor !== prevColorRef.current) {
    flipRef.current = !flipRef.current
    prevColorRef.current = currentColor
  }

  // One layer shows the current color at full opacity, the other is transparent
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
        borderRadius: 'var(--radius-panel)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* Color layer A — one of two alternating crossfade layers */}
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

      {/* Color layer B — the other alternating crossfade layer */}
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

      {/* Image layer — opacity crossfade */}
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
