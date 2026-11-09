import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useArrivals, useEnterOnce } from './useArrivals'

describe('useArrivals', () => {
  it('names only what appears after the first load, until the reset key changes', () => {
    const { result, rerender } = renderHook(({ ids, key }) => useArrivals(ids, key), {
      initialProps: { ids: undefined as string[] | undefined, key: 'rec-1' },
    })
    expect([...result.current]).toEqual([])

    rerender({ ids: ['a', 'b'], key: 'rec-1' })
    expect([...result.current]).toEqual([])

    rerender({ ids: ['a', 'b', 'c'], key: 'rec-1' })
    expect([...result.current]).toEqual(['c'])

    // Still there on later renders, and leaving does not undo it.
    rerender({ ids: ['a', 'c'], key: 'rec-1' })
    expect([...result.current]).toEqual(['c'])

    // Another lecture: its existing ids are not arrivals.
    rerender({ ids: undefined, key: 'rec-2' })
    rerender({ ids: ['x', 'y'], key: 'rec-2' })
    expect([...result.current]).toEqual([])
    rerender({ ids: ['x', 'y', 'z'], key: 'rec-2' })
    expect([...result.current]).toEqual(['z'])
  })
})

describe('useEnterOnce', () => {
  it('lets each arrival play once, from the render it arrives in', () => {
    const { result, rerender } = renderHook(({ ids }) => useEnterOnce(useArrivals(ids, 'week-1')), {
      initialProps: { ids: ['a'] },
    })
    expect(result.current('a')).toBe(false)

    // Known on the very render it appears in, so its element mounts arriving.
    rerender({ ids: ['a', 'b'] })
    expect(result.current('b')).toBe(true)

    // Mounting again later (a block dragged to another day) doesn't replay it.
    rerender({ ids: ['a', 'b'] })
    expect(result.current('b')).toBe(false)
    expect(result.current('a')).toBe(false)
  })
})
