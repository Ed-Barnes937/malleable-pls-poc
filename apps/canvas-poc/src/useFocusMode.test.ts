import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useFocusMode } from './useFocusMode'
import { useCanvasStore } from './canvas-store'

function seedPanels() {
  const { addPanel } = useCanvasStore.getState()
  addPanel({ id: 'a', pos_x: 0, pos_y: 0, width: 100, height: 80, z_index: 1 })
  addPanel({ id: 'b', pos_x: 50, pos_y: 50, width: 100, height: 80, z_index: 2 })
  addPanel({ id: 'c', pos_x: 100, pos_y: 100, width: 100, height: 80, z_index: 3 })
}

function pressKey(key: string, options?: Partial<KeyboardEventInit>) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

describe('useFocusMode', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      panels: [],
      focusModePanelId: null,
      fullscreenPanelId: null,
      preFullscreenLayout: null,
    })
  })

  it('F key toggles focus mode on the top z-index panel', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBe('c') // highest z-index

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('F key (uppercase) also toggles focus mode', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    pressKey('F')
    expect(useCanvasStore.getState().focusModePanelId).toBe('c')
  })

  it('F key does not fire when no panels exist', () => {
    renderHook(() => useFocusMode())
    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('F key does not fire when active element is an INPUT', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()

    document.body.removeChild(input)
  })

  it('F key does not fire when active element is a TEXTAREA', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()

    document.body.removeChild(textarea)
  })

  it('F key does not fire when active element is contenteditable', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    const div = document.createElement('div')
    div.contentEditable = 'true'
    div.tabIndex = 0 // Required for jsdom to accept focus on a div
    document.body.appendChild(div)
    div.focus()

    pressKey('f')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()

    document.body.removeChild(div)
  })

  it('F key does not fire when meta key is held', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    pressKey('f', { metaKey: true })
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('F key does not fire when ctrl key is held', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    pressKey('f', { ctrlKey: true })
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('Escape exits focus mode', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    useCanvasStore.getState().enterFocusMode('c')
    expect(useCanvasStore.getState().focusModePanelId).toBe('c')

    pressKey('Escape')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('Escape exits fullscreen before focus mode', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    useCanvasStore.getState().enterFocusMode('c')
    useCanvasStore.getState().enterFullscreen('c', 800, 600)

    // First Escape exits fullscreen
    pressKey('Escape')
    expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
    expect(useCanvasStore.getState().focusModePanelId).toBe('c') // still in focus mode

    // Second Escape exits focus mode
    pressKey('Escape')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
  })

  it('Escape does nothing when neither focus nor fullscreen is active', () => {
    seedPanels()
    renderHook(() => useFocusMode())

    // Should not throw or change state
    pressKey('Escape')
    expect(useCanvasStore.getState().focusModePanelId).toBeNull()
    expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
  })
})
