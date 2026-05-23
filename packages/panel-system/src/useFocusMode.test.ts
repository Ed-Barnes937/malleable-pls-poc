import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCanvasStore } from './canvas-store'
import { useFocusMode } from './useFocusMode'

function makePanel(id: string, z_index: number) {
  return { id, pos_x: 0, pos_y: 0, width: 300, height: 200, z_index }
}

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useFocusMode', () => {
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    useCanvasStore.setState(useCanvasStore.getInitialState())
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  function mount() {
    const result = renderHook(() => useFocusMode())
    cleanup = result.unmount
    return result
  }

  it('F key toggles focus mode on the top panel (highest z-index)', () => {
    useCanvasStore.setState({
      panels: [makePanel('a', 1), makePanel('b', 5), makePanel('c', 3)],
    })
    mount()

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBe('b')

    // Toggle off
    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('F key does nothing when no panels exist', () => {
    mount()

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('Escape exits fullscreen when a panel is fullscreened', () => {
    useCanvasStore.setState({
      panels: [makePanel('a', 1)],
      fullscreenPanelId: 'a',
      preFullscreenLayout: { pos_x: 10, pos_y: 10, width: 300, height: 200 },
    })
    mount()

    pressKey('Escape')
    expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
  })

  it('Escape exits focus mode when no panel is fullscreened', () => {
    useCanvasStore.setState({
      panels: [makePanel('a', 1)],
      focusModePanelId: 'a',
    })
    mount()

    pressKey('Escape')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('F key is suppressed when typing in an input element', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1)] })
    mount()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()

    document.body.removeChild(input)
  })

  it('F key is suppressed when Ctrl/Meta/Alt modifier is held', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1)] })
    mount()

    pressKey('f', { ctrlKey: true })
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()

    pressKey('f', { metaKey: true })
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()

    pressKey('f', { altKey: true })
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })
})
