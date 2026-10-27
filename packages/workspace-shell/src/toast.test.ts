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
})
