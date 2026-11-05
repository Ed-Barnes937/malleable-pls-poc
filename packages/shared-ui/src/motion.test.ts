import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MOTION_TIMING, SWAP_KEYFRAMES, boardSlideKeyframes, prefersReducedMotion, useListGlide, useReducedMotion } from './motion'

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

describe('useListGlide', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A list whose rows sit at `tops` (by key), counting every read of a row's place. */
  function list(tops: Record<string, number>) {
    const el = document.createElement('ul')
    const reads = { count: 0 }
    const animate = vi.fn()
    const rows = new Map<string, HTMLElement>()
    const order = (keys: string[]) => {
      el.replaceChildren(...keys.map((key) => {
        let row = rows.get(key)
        if (!row) {
          row = document.createElement('li')
          row.dataset.glideKey = key
          Object.defineProperty(row, 'offsetTop', { get: () => { reads.count++; return tops[key] } })
          row.animate = animate
          rows.set(key, row)
        }
        return row
      }))
    }
    return { ref: { current: el }, reads, animate, order }
  }

  it('glides a row that moved, adding to any motion of its own (its arrival keeps playing)', () => {
    mockReducedMotion(false)
    const tops: Record<string, number> = { a: 0, b: 40 }
    const l = list(tops)
    l.order(['a', 'b'])
    const { rerender } = renderHook(({ keys }) => useListGlide(l.ref, keys), { initialProps: { keys: ['a', 'b'] } })
    expect(l.animate).not.toHaveBeenCalled()
    // A new row on top: the others move down by its height.
    tops.c = 0; tops.a = 40; tops.b = 80
    l.order(['c', 'a', 'b'])
    rerender({ keys: ['c', 'a', 'b'] })
    expect(l.animate).toHaveBeenCalledTimes(2)
    expect(l.animate).toHaveBeenCalledWith(
      [{ transform: 'translateY(-40px)' }, { transform: 'translateY(0px)' }],
      expect.objectContaining({ composite: 'add' }),
    )
  })

  it('reads the rows\' places only when their order changes, not on every render', () => {
    mockReducedMotion(false)
    const l = list({ a: 0, b: 40 })
    l.order(['a', 'b'])
    const { rerender } = renderHook(({ keys }) => useListGlide(l.ref, keys), { initialProps: { keys: ['a', 'b'] } })
    const reads = l.reads.count
    rerender({ keys: ['a', 'b'] })
    rerender({ keys: ['a', 'b'] })
    expect(l.reads.count).toBe(reads)
  })

  it('glides nothing under reduced motion', () => {
    mockReducedMotion(true)
    const tops: Record<string, number> = { a: 0, b: 40 }
    const l = list(tops)
    l.order(['a', 'b'])
    const { rerender } = renderHook(({ keys }) => useListGlide(l.ref, keys), { initialProps: { keys: ['a', 'b'] } })
    tops.a = 40; tops.b = 0
    l.order(['b', 'a'])
    rerender({ keys: ['b', 'a'] })
    expect(l.animate).not.toHaveBeenCalled()
  })
})
