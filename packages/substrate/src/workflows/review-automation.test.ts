import { describe, it, expect } from 'vitest'
import { DEFAULT_REVIEW_PARAMS, parseReviewParams, reviewTaskParamsInput, reviewWindowLabel } from './review-automation'
import { getJobTypesForTrigger } from './executors'

describe('parseReviewParams', () => {
  it('reads stored params, as an object or JSON text', () => {
    const stored = { durationMin: 30, windowDays: 1, timeZone: 'America/New_York' }
    expect(parseReviewParams(stored)).toEqual(stored)
    expect(parseReviewParams(JSON.stringify(stored))).toEqual(stored)
  })

  it('falls back to the defaults field by field', () => {
    expect(parseReviewParams({})).toEqual(DEFAULT_REVIEW_PARAMS)
    expect(parseReviewParams(null)).toEqual(DEFAULT_REVIEW_PARAMS)
    expect(parseReviewParams('not json')).toEqual(DEFAULT_REVIEW_PARAMS)
    expect(parseReviewParams({ durationMin: 45, windowDays: 0, timeZone: 'Mars/Olympus' })).toEqual({
      ...DEFAULT_REVIEW_PARAMS,
      durationMin: 45,
    })
  })

  it('defaults to a 20-min review within 3 days in Europe/London', () => {
    expect(DEFAULT_REVIEW_PARAMS).toEqual({ durationMin: 20, windowDays: 3, timeZone: 'Europe/London' })
  })
})

describe('reviewTaskParamsInput', () => {
  it('rejects unknown time zones and out-of-range values', () => {
    expect(reviewTaskParamsInput.safeParse({ durationMin: 20, windowDays: 3, timeZone: 'Europe/London' }).success).toBe(true)
    expect(reviewTaskParamsInput.safeParse({ durationMin: 20, windowDays: 3, timeZone: 'Nowhere/Here' }).success).toBe(false)
    expect(reviewTaskParamsInput.safeParse({ durationMin: 0, windowDays: 3, timeZone: 'UTC' }).success).toBe(false)
    expect(reviewTaskParamsInput.safeParse({ durationMin: 20, windowDays: 30, timeZone: 'UTC' }).success).toBe(false)
  })
})

describe('reviewWindowLabel', () => {
  it('reads like a student would say it', () => {
    expect(reviewWindowLabel(1)).toBe('by tomorrow')
    expect(reviewWindowLabel(3)).toBe('within 3 days')
    expect(reviewWindowLabel(7)).toBe('within a week')
  })
})

describe('getJobTypesForTrigger', () => {
  it('offers only the steps that understand the trigger', () => {
    expect(getJobTypesForTrigger('tag:created').map((j) => j.type)).toEqual(['plan:review-task'])
    expect(getJobTypesForTrigger('recording:transcribed').map((j) => j.type)).toEqual(['ai:summarize-lecture'])
    expect(getJobTypesForTrigger('annotation:created')).toEqual([])
  })
})
