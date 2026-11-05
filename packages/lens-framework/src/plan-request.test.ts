import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAN_REQUEST_TTL_MS, requestHelpMePlan, takeHelpMePlanRequest } from './plan-request'

afterEach(() => {
  vi.useRealTimers()
  takeHelpMePlanRequest()
})

describe('Help me plan requests', () => {
  it('is taken once, by whichever Calendar asks first', () => {
    expect(takeHelpMePlanRequest()).toBe(false)
    requestHelpMePlan()
    expect(takeHelpMePlanRequest()).toBe(true)
    expect(takeHelpMePlanRequest()).toBe(false)
  })

  it('waits for a Calendar that is still being added, then expires if none takes it', () => {
    vi.useFakeTimers()
    requestHelpMePlan()
    vi.advanceTimersByTime(PLAN_REQUEST_TTL_MS - 1)
    expect(takeHelpMePlanRequest()).toBe(true)

    requestHelpMePlan()
    vi.advanceTimersByTime(PLAN_REQUEST_TTL_MS + 1)
    expect(takeHelpMePlanRequest()).toBe(false)
  })
})
