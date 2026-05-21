import { useCanvasStore } from './canvas-store'

/**
 * WorkspaceBackground renders a background layer behind canvas panels.
 *
 * It uses two stacked layers to crossfade between backgrounds:
 * - Solid colors and gradients use CSS `background` with a 300ms transition
 * - Image URLs use an opacity crossfade since `background-image` doesn't
 *   transition smoothly between different URLs
 */
export function WorkspaceBackground() {
  const background = useCanvasStore((s) => s.background)

  const isImage = background.type === 'image' && background.value.trim() !== ''
  const isSolidOrGradient = background.type === 'solid' || background.type === 'gradient'

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
      {/* Solid / gradient layer */}
      <div
        data-testid="workspace-bg-color-layer"
        style={{
          position: 'absolute',
          inset: 0,
          background: isSolidOrGradient ? background.value : 'transparent',
          transition: 'background 300ms ease-out',
        }}
      />

      {/* Image layer — opacity crossfade */}
      <div
        data-testid="workspace-bg-image-layer"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: isImage ? `url(${background.value})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: isImage ? 1 : 0,
          transition: 'opacity 300ms ease-out',
        }}
      />
    </div>
  )
}
