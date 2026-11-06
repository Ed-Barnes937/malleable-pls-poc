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
    expect(shown).toHaveTextContent("Couldn't save")
    expect(shown.parentElement).toHaveAttribute('inert')
    expect(shown.parentElement).toHaveAttribute('data-leaving')
    expect(shown.parentElement).toHaveClass('motion-safe:animate-leave')
    // Marked as leaving, so nothing takes it for the one on show.
    expect(screen.queryByTestId('alert')).toBe(null)
    expect(screen.getByTestId('alert-leaving')).toBe(shown)

    act(() => { vi.advanceTimersByTime(MOTION_MS) })
    expect(screen.queryByTestId('alert')).toBeNull()
    expect(screen.queryByTestId('alert-leaving')).toBeNull()
  })

  it('coming back while it leaves shows it again, and it stays', () => {
    mockReducedMotion(false)
    vi.useFakeTimers()
    const { rerender } = render(<Alert text="One" />)
    rerender(<Alert text={null} />)
    rerender(<Alert text="Two" />)
    act(() => { vi.advanceTimersByTime(MOTION_MS * 2) })
    expect(screen.getByTestId('alert')).toHaveTextContent('Two')
    expect(screen.queryByTestId('alert-leaving')).toBeNull()
    expect(screen.getByTestId('alert').parentElement).not.toHaveAttribute('inert')
  })

  it('unmarks only what it marked: a Presence inside it, or an id of its own ending in -leaving, keeps its mark', () => {
    mockReducedMotion(false)
    vi.useFakeTimers()
    const Board = ({ shown, tip }: { shown: boolean; tip: boolean }) => (
      <Presence>
        {shown ? (
          <section data-testid="board">
            {/* E.g. a calendar's own copy of a block that is going. */}
            <div data-testid="block-leaving" />
            <Presence>{tip ? <p data-testid="tip">Tip</p> : null}</Presence>
          </section>
        ) : null}
      </Presence>
    )
    const { rerender } = render(<Board shown tip />)
    // The tip leaves while the board stays.
    rerender(<Board shown tip={false} />)
    expect(screen.getByTestId('tip-leaving')).toHaveTextContent('Tip')
    expect(screen.queryByTestId('tip')).toBeNull()
    expect(screen.getByTestId('block-leaving')).toBeInTheDocument()
    expect(screen.getByTestId('board')).toBeInTheDocument()

    // The board leaves and comes back while the tip is still leaving.
    rerender(<Board shown={false} tip={false} />)
    expect(screen.getByTestId('board-leaving')).toBeInTheDocument()
    rerender(<Board shown tip={false} />)
    expect(screen.getByTestId('board')).toBeInTheDocument()
    expect(screen.getByTestId('tip-leaving')).toBeInTheDocument()
    expect(screen.queryByTestId('tip')).toBeNull()
    expect(screen.getByTestId('block-leaving')).toBeInTheDocument()
    expect(screen.queryByTestId('block')).toBeNull()

    act(() => { vi.advanceTimersByTime(MOTION_MS) })
    expect(screen.queryByTestId('tip-leaving')).toBeNull()
    expect(screen.getByTestId('block-leaving')).toBeInTheDocument()
  })

  it('under reduced motion, goes at once', () => {
    mockReducedMotion(true)
    const { rerender } = render(<Alert text="Couldn't save" />)
    rerender(<Alert text={null} />)
    expect(screen.queryByTestId('alert')).toBeNull()
  })
})
