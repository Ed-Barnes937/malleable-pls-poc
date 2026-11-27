import { useEffect } from 'react'
import { useCanvasStore } from './canvas-store'
import { scrollPanelIntoView } from './reveal'

/** Tags that indicate the user is typing — single-key shortcuts are suppressed */
const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Returns true if the active element is an input-like field where
 * single-key shortcuts should be suppressed.
 */
function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (INPUT_TAGS.has(el.tagName)) return true
  if (el instanceof HTMLElement && (el.isContentEditable || el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true')) return true
  return false
}

/**
 * True when keyboard focus is somewhere other than the page itself or the
 * canvas (e.g. the top bar, the board menu, a dialog). Canvas shortcuts then
 * stay out of the way so those controls behave normally.
 */
function focusOutsideCanvas(canvas: HTMLElement | null | undefined): boolean {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement) return false
  return !canvas?.contains(el)
}

/**
 * True when keyboard focus is on a control inside a panel (a transcript
 * moment, a button, a calendar block), rather than on the panel itself or
 * outside every panel. Delete belongs to that control then, never to the panel.
 */
function focusOnControlInPanel(): boolean {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement) return false
  const panel = el.closest('[data-panel-id]')
  return panel !== null && panel !== el
}

export interface CanvasKeyboardOptions {
  /** Remove a panel through the host (so the deletion is also persisted). Falls
   *  back to the store's local removePanel when not provided. */
  onRemovePanel?: (panelId: string) => void
  /** Canvas element — needed to size a panel when toggling fullscreen. */
  canvasRef?: React.RefObject<HTMLDivElement | null>
  /** Alt+arrow on the selected panel (UI SDK's `move.keydown`). Returns whether it moved it. */
  onMoveKey?: (event: KeyboardEvent, panelId: string) => boolean
}

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/**
 * Keyboard shortcuts that act on the currently selected lens.
 *
 * - **] / [** - cycle the selection forward/backward through panels. Tab is
 *   left alone so keyboard users can always reach every control.
 * - **f / F** — toggle fullscreen on the selected panel (falls back to the
 *   top-most panel when nothing is selected).
 * - **Backspace / Delete** - remove the selected panel, unless focus is on a
 *   control inside a panel (the key is that control's then).
 * - **Escape** — exit fullscreen, then focus mode, then clear the selection.
 * - **Alt+arrow** - move the selected panel one grid step (`onMoveKey`).
 *   Left to a text field (word jump on macOS) and to a widget that handled it.
 *
 * All shortcuts are suppressed while typing in an input/textarea/
 * contenteditable, and while focus is outside the canvas (top bar, board
 * menu, dialogs), so they don't interfere with other controls.
 */
export function useCanvasKeyboard({ onRemovePanel, canvasRef, onMoveKey }: CanvasKeyboardOptions = {}): void {
  useEffect(() => {
    function topPanelId(): string | null {
      const { panels } = useCanvasStore.getState()
      if (panels.length === 0) return null
      return panels.reduce((top, p) => (p.z_index > top.z_index ? p : top)).id
    }

    function handleKeyDown(e: KeyboardEvent) {
      const state = useCanvasStore.getState()
      if (focusOutsideCanvas(canvasRef?.current)) return

      // Alt+arrow - move the selected panel
      if (e.altKey && ARROWS.has(e.key)) {
        if (isTyping() || e.defaultPrevented || e.metaKey || e.ctrlKey) return
        if (state.selectedPanelId) onMoveKey?.(e, state.selectedPanelId)
        return
      }

      // ] / [ - cycle selection
      if (e.key === ']' || e.key === '[') {
        if (isTyping()) return
        if (e.metaKey || e.ctrlKey || e.altKey) return
        if (state.panels.length === 0) return
        state.selectNext(e.key === '[')
        // The newly selected widget may sit below the fold of a scrolled board.
        const selected = useCanvasStore.getState().selectedPanelId
        if (selected) scrollPanelIntoView(canvasRef?.current, selected)
        e.preventDefault()
        return
      }

      // f — fullscreen the selected panel (or the top panel if none selected)
      if (e.key === 'f' || e.key === 'F') {
        if (isTyping()) return
        if (e.metaKey || e.ctrlKey || e.altKey) return
        const targetId = state.selectedPanelId ?? topPanelId()
        const canvas = canvasRef?.current
        if (!targetId || !canvas) return
        const rect = canvas.getBoundingClientRect()
        state.toggleFullscreen(targetId, rect.width, rect.height)
        e.preventDefault()
        return
      }

      // Backspace / Delete - remove the selected panel
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (isTyping() || focusOnControlInPanel()) return
        const targetId = state.selectedPanelId
        if (!targetId) return
        if (onRemovePanel) onRemovePanel(targetId)
        else state.removePanel(targetId)
        e.preventDefault()
        return
      }

      // Escape — unwind fullscreen → focus mode → selection
      if (e.key === 'Escape') {
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
        if (state.selectedPanelId) {
          state.selectPanel(null)
          e.preventDefault()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onRemovePanel, canvasRef, onMoveKey])
}
