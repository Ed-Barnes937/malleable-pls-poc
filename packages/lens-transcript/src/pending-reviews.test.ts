import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { REVIEW_WAIT_MS, usePendingReviews } from './pending-reviews'

describe('usePendingReviews', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const render = (reviewed: Set<string> = new Set()) =>
    renderHook(({ has }) => usePendingReviews(has), { initialProps: { has: (id: string) => reviewed.has(id) } })

  it('says a review is being planned, then gives way to the review when it arrives', () => {
    const reviewed = new Set<string>()
    const { result, rerender } = render(reviewed)
    act(() => result.current.mark('seg-1'))
    act(() => result.current.started('seg-1', 1))
    expect(result.current.stateOf('seg-1')).toBe('planning')

    reviewed.add('seg-1')
    rerender({ has: (id: string) => reviewed.has(id) })
    expect(result.current.stateOf('seg-1')).toBeNull()
  })

  it('says no review is planned at once when no automation started', () => {
    const { result } = render()
    act(() => result.current.mark('seg-1'))
    act(() => result.current.started('seg-1', 0))
    expect(result.current.stateOf('seg-1')).toBe('none')
  })

  it('gives up after a while when nothing arrives (the automation failed)', () => {
    const { result } = render()
    act(() => result.current.mark('seg-1'))
    act(() => result.current.started('seg-1', 1))
    act(() => vi.advanceTimersByTime(REVIEW_WAIT_MS - 1))
    expect(result.current.stateOf('seg-1')).toBe('planning')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.stateOf('seg-1')).toBe('none')
  })

  it('shows nothing when the tag itself did not save', () => {
    const { result } = render()
    act(() => result.current.mark('seg-1'))
    act(() => result.current.failed('seg-1'))
    expect(result.current.stateOf('seg-1')).toBeNull()
  })
})
