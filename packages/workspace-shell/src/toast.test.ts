import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useToastStore } from './toast'

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
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
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('keeps a toast with an action for 8s', () => {
    useToastStore.getState().push({ message: 'Opened 1:18 in In Lecture', tone: 'success', action: { label: 'Back to My week', onClick: () => {} } })
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toEqual([])
  })

  it('pauses while held and starts again from its full time when released', () => {
    const { push, hold, release } = useToastStore.getState()
    push({ message: 'Transcript added', tone: 'success' })
    const { id } = useToastStore.getState().toasts[0]
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
    vi.advanceTimersByTime(60_000)
    const [toast] = useToastStore.getState().toasts
    expect(toast.message).toBe('Opened 1:18 in In Lecture')
    dismiss(toast.id)
    expect(useToastStore.getState().toasts).toEqual([])
  })
})
