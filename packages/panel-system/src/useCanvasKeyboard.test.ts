import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCanvasStore } from './canvas-store'
import { useCanvasKeyboard } from './useCanvasKeyboard'

function makePanel(id: string, z_index: number) {
  return { id, pos_x: 0, pos_y: 0, width: 300, height: 200, z_index }
}

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useCanvasKeyboard', () => {
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    useCanvasStore.setState(useCanvasStore.getInitialState())
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  function mount(opts: Parameters<typeof useCanvasKeyboard>[0] = {}) {
    const result = renderHook(() => useCanvasKeyboard(opts))
    cleanup = result.unmount
    return result
  }

  /* ── Tab cycling ── */

  it('Tab selects the first panel when nothing is selected, then cycles forward', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 2), makePanel('c', 3)] })
    mount()

    pressKey('Tab')
    expect(useCanvasStore.getState().selectedPanelId).toBe('a')
    pressKey('Tab')
    expect(useCanvasStore.getState().selectedPanelId).toBe('b')
    pressKey('Tab')
    expect(useCanvasStore.getState().selectedPanelId).toBe('c')
    pressKey('Tab')
    expect(useCanvasStore.getState().selectedPanelId).toBe('a')
  })

  it('Shift+Tab cycles backward', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 2), makePanel('c', 3)] })
    mount()

    pressKey('Tab', { shiftKey: true })
    expect(useCanvasStore.getState().selectedPanelId).toBe('c')
    pressKey('Tab', { shiftKey: true })
    expect(useCanvasStore.getState().selectedPanelId).toBe('b')
  })

  it('Tab brings the newly selected panel to the front', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 2), makePanel('c', 3)] })
    mount()

    pressKey('Tab') // selects 'a'
    const a = useCanvasStore.getState().panels.find((p) => p.id === 'a')!
    const maxZ = Math.max(...useCanvasStore.getState().panels.map((p) => p.z_index))
    expect(a.z_index).toBe(maxZ)
  })

  /* ── Fullscreen (f) ── */

  it('f toggles fullscreen on the selected panel', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 2)], selectedPanelId: 'a' })
    mount({ canvasRef: { current: document.createElement('div') } })

    pressKey('f')
    expect(useCanvasStore.getState().fullscreenPanelId).toBe('a')
    pressKey('f')
    expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
  })

  it('f falls back to the top panel when nothing is selected', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 5), makePanel('c', 3)] })
    mount({ canvasRef: { current: document.createElement('div') } })

    pressKey('f')
    expect(useCanvasStore.getState().fullscreenPanelId).toBe('b')
  })

  it('f is suppressed with a Ctrl/Meta/Alt modifier', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1)], selectedPanelId: 'a' })
    mount({ canvasRef: { current: document.createElement('div') } })

    pressKey('f', { ctrlKey: true })
    pressKey('f', { metaKey: true })
    pressKey('f', { altKey: true })
    expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
  })

  /* ── Removal (Backspace / Delete) ── */

  it('Backspace removes the selected panel via the host callback', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 2)], selectedPanelId: 'b' })
    const onRemovePanel = vi.fn()
    mount({ onRemovePanel })

    pressKey('Backspace')
    expect(onRemovePanel).toHaveBeenCalledWith('b')
  })

  it('Delete removes the selected panel from the store when no callback is given', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 2)], selectedPanelId: 'b' })
    mount()

    pressKey('Delete')
    expect(useCanvasStore.getState().panels.map((p) => p.id)).toEqual(['a'])
    expect(useCanvasStore.getState().selectedPanelId).toBeNull()
  })

  it('Backspace does nothing when nothing is selected', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1)] })
    const onRemovePanel = vi.fn()
    mount({ onRemovePanel })

    pressKey('Backspace')
    expect(onRemovePanel).not.toHaveBeenCalled()
    expect(useCanvasStore.getState().panels).toHaveLength(1)
  })

  /* ── Escape ── */

  it('Escape clears the selection when nothing is fullscreen/focused', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1)], selectedPanelId: 'a' })
    mount()

    pressKey('Escape')
    expect(useCanvasStore.getState().selectedPanelId).toBeNull()
  })

  it('Escape exits fullscreen before clearing the selection', () => {
    useCanvasStore.setState({
      panels: [makePanel('a', 1)],
      selectedPanelId: 'a',
      fullscreenPanelId: 'a',
      preFullscreenLayout: { pos_x: 10, pos_y: 10, width: 300, height: 200 },
    })
    mount()

    pressKey('Escape')
    expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
    expect(useCanvasStore.getState().selectedPanelId).toBe('a')
  })

  /* ── Typing suppression ── */

  it('shortcuts are suppressed while typing in an input', () => {
    useCanvasStore.setState({ panels: [makePanel('a', 1), makePanel('b', 2)], selectedPanelId: 'a' })
    const onRemovePanel = vi.fn()
    mount({ onRemovePanel, canvasRef: { current: document.createElement('div') } })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    pressKey('Tab')
    pressKey('f')
    pressKey('Backspace')
    expect(useCanvasStore.getState().selectedPanelId).toBe('a')
    expect(useCanvasStore.getState().fullscreenPanelId).toBeNull()
    expect(onRemovePanel).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })
})
