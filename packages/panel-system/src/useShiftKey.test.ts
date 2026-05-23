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
})
