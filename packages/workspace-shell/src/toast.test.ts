import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { announcement, useToastStore } from './toast'

/** As the bar does: every current toast is on screen. */
const showAll = () => useToastStore.getState().setShown(useToastStore.getState().toasts.map((t) => t.id))

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
    useToastStore.getState().setShown([])
  })
  afterEach(() => vi.useRealTimers())

  it('stacks unkeyed toasts', () => {
    const { push } = useToastStore.getState()
    push({ message: 'Transcript ready', tone: 'success' })
    push({ message: 'Connections found', tone: 'success' })
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Transcript ready', 'Connections found'])
  })

  it('replaces a toast with the same key instead of stacking', () => {
    const { push } = useToastStore.getState()
    push({ message: 'Transcript added', tone: 'success', key: 'widget-added' })
    push({ message: 'Transcript ready', tone: 'success' })
    push({ message: 'Weakest Topics added', tone: 'success', key: 'widget-added' })
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Transcript ready', 'Weakest Topics added'])
  })

  it('expires each toast after 4s', () => {
    useToastStore.getState().push({ message: 'Transcript added', tone: 'success', key: 'widget-added' })
    showAll()
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('keeps a toast with an action for 8s', () => {
    useToastStore.getState().push({ message: 'Opened 1:18 in In Lecture', tone: 'success', action: { label: 'Back to My week', onClick: () => {} } })
    showAll()
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('pauses while held and starts again from its full time when released', () => {
    const { push, hold, release } = useToastStore.getState()
    push({ message: 'Transcript added', tone: 'success' })
    const { id } = useToastStore.getState().toasts[0]
    showAll()
    vi.advanceTimersByTime(3000)
    hold(id)
    vi.advanceTimersByTime(10_000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    release(id)
    vi.advanceTimersByTime(3999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('keeps a toast with no duration until it is dismissed', () => {
    const { push, dismiss } = useToastStore.getState()
    push({ message: 'Opened 1:18 in In Lecture', tone: 'success', durationMs: null })
    showAll()
    vi.advanceTimersByTime(60_000)
    const [toast] = useToastStore.getState().toasts
    expect(toast.message).toBe('Opened 1:18 in In Lecture')
    dismiss(toast.id)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('only counts down while on screen: a toast waiting behind a newer one gets its whole time once shown', () => {
    const { push, setShown } = useToastStore.getState()
    push({ message: 'Transcript ready', tone: 'success', action: { label: 'Show', onClick: () => {} } })
    push({ message: 'Audio Capture removed', tone: 'success' })
    const [older, newer] = useToastStore.getState().toasts
    // A phone shows the newest only.
    setShown([newer.id])
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Transcript ready'])
    setShown([older.id])
    vi.advanceTimersByTime(7999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('a toast pushed out mid-countdown keeps the rest of its time for when it shows again', () => {
    const { push, setShown } = useToastStore.getState()
    push({ message: 'Transcript ready', tone: 'success' })
    const [first] = useToastStore.getState().toasts
    setShown([first.id])
    vi.advanceTimersByTime(1000)
    push({ message: 'Lecture summary ready', tone: 'success' })
    const second = useToastStore.getState().toasts[1]
    setShown([second.id])
    vi.advanceTimersByTime(10_000)
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Transcript ready'])
    setShown([first.id])
    vi.advanceTimersByTime(2999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('a toast held (hovered) when pushed out of view counts down again once it is back', () => {
    const { push, hold, setShown } = useToastStore.getState()
    push({ message: 'Transcript ready', tone: 'success' })
    const [first] = useToastStore.getState().toasts
    setShown([first.id])
    vi.advanceTimersByTime(1000)
    hold(first.id)
    // A newer toast takes its place; its element goes, so it is never released.
    push({ message: 'Lecture summary ready', tone: 'success' })
    const second = useToastStore.getState().toasts[1]
    setShown([second.id])
    vi.advanceTimersByTime(4000)
    setShown([first.id])
    vi.advanceTimersByTime(2999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts).toEqual([])
  })
})

describe('announcement', () => {
  it('is the message, and names the action and where it is when there is one', () => {
    expect(announcement({ message: 'Transcript added' })).toBe('Transcript added')
    expect(announcement({ message: 'Review added to your plan', action: { label: 'See it', onClick: () => {} } }))
      .toBe('Review added to your plan. Notifications has a See it button.')
  })
})
