import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useArrivals } from './useArrivals'

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
