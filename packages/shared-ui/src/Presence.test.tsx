import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Presence } from './Presence'
import { MOTION_MS } from './motion'

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const Alert = ({ text }: { text: string | null }) => (
  <Presence>{text ? <p data-testid="alert">{text}</p> : null}</Presence>
)

describe('Presence', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps what went, out of reach, for the leave motion, then removes it', () => {
    mockReducedMotion(false)
    vi.useFakeTimers()
    const { rerender } = render(<Alert text="Couldn't save" />)
    const shown = screen.getByTestId('alert')
    expect(shown.parentElement).not.toHaveAttribute('inert')

    rerender(<Alert text={null} />)
    // The same element, now leaving (never remounted, so it never misses a frame).
    expect(screen.getByTestId('alert')).toBe(shown)
    expect(shown).toHaveTextContent("Couldn't save")
    expect(shown.parentElement).toHaveAttribute('inert')
    expect(shown.parentElement).toHaveAttribute('data-leaving')
    expect(shown.parentElement).toHaveClass('motion-safe:animate-leave')

    act(() => { vi.advanceTimersByTime(MOTION_MS) })
    expect(screen.queryByTestId('alert')).toBeNull()
  })

  it('coming back while it leaves shows it again, and it stays', () => {
    mockReducedMotion(false)
    vi.useFakeTimers()
    const { rerender } = render(<Alert text="One" />)
    rerender(<Alert text={null} />)
    rerender(<Alert text="Two" />)
    act(() => { vi.advanceTimersByTime(MOTION_MS * 2) })
    expect(screen.getByTestId('alert')).toHaveTextContent('Two')
    expect(screen.getByTestId('alert').parentElement).not.toHaveAttribute('inert')
  })

  it('under reduced motion, goes at once', () => {
    mockReducedMotion(true)
    const { rerender } = render(<Alert text="Couldn't save" />)
    rerender(<Alert text={null} />)
    expect(screen.queryByTestId('alert')).toBeNull()
  })
})
