import { useEffect } from 'react'
import { useCanvasStore } from './canvas-store'

/** Tags that indicate the user is typing — F key should be suppressed */
const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Returns true if the active element is an input-like field where
 * single-key shortcuts should be suppressed.
 */
function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (INPUT_TAGS.has(el.tagName)) return true
  // Check contenteditable via multiple approaches for cross-environment compatibility
  if (el instanceof HTMLElement && (el.isContentEditable || el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true')) return true
  return false
}

/**
 * Keyboard listener for focus-mode and fullscreen shortcuts.
 *
 * - **F** — toggles focus mode on the panel with the highest z-index.
 *   Suppressed when the user is typing in an input/textarea/contenteditable.
 * - **Escape** — exits fullscreen first (if active), then focus mode.
 *
 * `getCanvasDimensions` is a callback that returns the current canvas
 * container size — needed only for fullscreen (not used by this hook,
 * but Escape needs to exit fullscreen which doesn't need dimensions).
 */
export function useFocusMode(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') {
        // Don't intercept if user is typing or if modifier keys are held
        if (isTyping()) return
        if (e.metaKey || e.ctrlKey || e.altKey) return

        const state = useCanvasStore.getState()
        const { panels } = state

        if (panels.length === 0) return

        // Find the panel with the highest z-index
        const topPanel = panels.reduce((top, p) =>
          p.z_index > top.z_index ? p : top,
        )

        state.toggleFocusMode(topPanel.id)
        e.preventDefault()
        return
      }

      if (e.key === 'Escape') {
        const state = useCanvasStore.getState()

        // Exit fullscreen first, then focus mode
        if (state.fullscreenPanelId) {
          state.exitFullscreen()
          e.preventDefault()
          return
        }

        if (state.focusModePanelId) {
          state.exitFocusMode()
          e.preventDefault()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
