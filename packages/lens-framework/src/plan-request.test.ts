import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAN_REQUEST_TTL_MS, requestHelpMePlan, takeHelpMePlanRequest } from './plan-request'

afterEach(() => {
  vi.useRealTimers()
  takeHelpMePlanRequest('a')
  takeHelpMePlanRequest('b')
})

describe('Help me plan requests', () => {
  it('is taken once, by whichever Calendar asks first', () => {
    expect(takeHelpMePlanRequest('a')).toBe(false)
    requestHelpMePlan('a')
    expect(takeHelpMePlanRequest('a')).toBe(true)
    expect(takeHelpMePlanRequest('a')).toBe(false)
  })

  it('goes only to the Calendar it names, and waits for it', () => {
    requestHelpMePlan('a')
    expect(takeHelpMePlanRequest('b')).toBe(false)
    expect(takeHelpMePlanRequest('a')).toBe(true)
  })

  it('waits for a Calendar that is still being added, then expires if none takes it', () => {
    vi.useFakeTimers()
    requestHelpMePlan('a')
    vi.advanceTimersByTime(PLAN_REQUEST_TTL_MS - 1)
    expect(takeHelpMePlanRequest('a')).toBe(true)

    requestHelpMePlan('a')
    vi.advanceTimersByTime(PLAN_REQUEST_TTL_MS + 1)
    expect(takeHelpMePlanRequest('a')).toBe(false)
  })
})
