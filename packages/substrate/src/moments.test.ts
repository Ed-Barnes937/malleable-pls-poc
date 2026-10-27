import { describe, it, expect } from 'vitest'
import { momentStatus } from './moments'

const MARKED = '2026-04-16T10:00:00Z'
const BEFORE = '2026-04-16T09:00:00Z'
const AFTER = '2026-04-16T11:00:00Z'

describe('momentStatus', () => {
  it('a moment never rated or marked is still being learnt', () => {
    expect(momentStatus({ latestScore: null, latestAt: null, confusedAt: null })).toBe('learning')
  })

  it('a low latest rating needs review, even after feeling sure earlier', () => {
    expect(momentStatus({ latestScore: 49, latestAt: AFTER, confusedAt: null })).toBe('review')
    expect(momentStatus({ latestScore: 50, latestAt: AFTER, confusedAt: null })).toBe('learning')
  })

  it('a high latest rating is solid', () => {
    expect(momentStatus({ latestScore: 70, latestAt: AFTER, confusedAt: null })).toBe('solid')
    expect(momentStatus({ latestScore: 69, latestAt: AFTER, confusedAt: null })).toBe('learning')
  })

  it('a confusing mark needs review until the student feels sure after it', () => {
    expect(momentStatus({ latestScore: null, latestAt: null, confusedAt: MARKED })).toBe('review')
    expect(momentStatus({ latestScore: 90, latestAt: BEFORE, confusedAt: MARKED })).toBe('review')
    expect(momentStatus({ latestScore: 60, latestAt: AFTER, confusedAt: MARKED })).toBe('review')
    expect(momentStatus({ latestScore: 90, latestAt: AFTER, confusedAt: MARKED })).toBe('solid')
  })
})
