import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MOTION_TIMING, SWAP_KEYFRAMES, boardSlideKeyframes, prefersReducedMotion, useReducedMotion } from './motion'

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('motion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('slides a board in from the side of its tab', () => {
    expect(boardSlideKeyframes('right')[0]).toMatchObject({ opacity: 0, transform: 'translateX(28px)' })
    expect(boardSlideKeyframes('left')[0]).toMatchObject({ opacity: 0, transform: 'translateX(-28px)' })
  })

  it('ends every motion on the element itself, never pinned to its end values', () => {
    // An empty last keyframe is the element's own look; `backwards`, never `both`.
    expect(boardSlideKeyframes('right').at(-1)).toEqual({})
    expect(SWAP_KEYFRAMES.at(-1)).toEqual({})
    expect(MOTION_TIMING.fill).toBe('backwards')
  })

  it('reads the reduced motion setting', () => {
    mockReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true)
    mockReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
