import { describe, it, expect, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useShiftKey } from './useShiftKey'

function fireWindowKey(type: 'keydown' | 'keyup', key: string) {
  window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
}

describe('useShiftKey', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  function mount() {
    const result = renderHook(() => useShiftKey())
    cleanup = result.unmount
    return result
  }

  it('returns false initially', () => {
    const { result } = mount()
    expect(result.current.current).toBe(false)
  })

  it('sets to true on Shift keydown', () => {
    const { result } = mount()

    fireWindowKey('keydown', 'Shift')
    expect(result.current.current).toBe(true)
  })

  it('sets to false on Shift keyup', () => {
    const { result } = mount()

    fireWindowKey('keydown', 'Shift')
    expect(result.current.current).toBe(true)

    fireWindowKey('keyup', 'Shift')
    expect(result.current.current).toBe(false)
  })

  it('resets to false on window blur', () => {
    const { result } = mount()

    fireWindowKey('keydown', 'Shift')
    expect(result.current.current).toBe(true)

    window.dispatchEvent(new Event('blur'))
    expect(result.current.current).toBe(false)
  })

  it('ignores non-Shift keys', () => {
    const { result } = mount()

    fireWindowKey('keydown', 'Control')
    expect(result.current.current).toBe(false)

    fireWindowKey('keydown', 'a')
    expect(result.current.current).toBe(false)
  })

  it('follows the Shift state pointer events carry (pressed before the page had focus)', () => {
    const { result } = mount()
    window.dispatchEvent(new MouseEvent('pointermove', { shiftKey: true }))
    expect(result.current.current).toBe(true)
    window.dispatchEvent(new MouseEvent('pointermove', { shiftKey: false }))
    expect(result.current.current).toBe(false)
  })

  it('tells onChange of each press and release, once', () => {
    const changes: boolean[] = []
    const { unmount } = renderHook(() => useShiftKey((held) => changes.push(held)))
    cleanup = unmount
    fireWindowKey('keydown', 'Shift')
    fireWindowKey('keydown', 'Shift')
    fireWindowKey('keyup', 'Shift')
    expect(changes).toEqual([true, false])
  })
})
