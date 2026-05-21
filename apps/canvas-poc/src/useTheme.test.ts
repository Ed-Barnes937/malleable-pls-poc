import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to dark theme', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('sets data-theme attribute on documentElement', () => {
    renderHook(() => useTheme('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('accepts a custom initial theme', () => {
    const { result } = renderHook(() => useTheme('light'))
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('toggles from dark to light', () => {
    const { result } = renderHook(() => useTheme('dark'))
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('toggles from light to dark', () => {
    const { result } = renderHook(() => useTheme('light'))
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggles back and forth', () => {
    const { result } = renderHook(() => useTheme('dark'))
    act(() => result.current.toggle())
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('dark')
  })
})
