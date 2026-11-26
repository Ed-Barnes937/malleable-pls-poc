import { describe, it, expect } from 'vitest'
import { leadingTag } from './TagPill'

describe('leadingTag', () => {
  it('leads with confusion, then questions, then key points', () => {
    expect(leadingTag(['key-point', 'question'])).toBe('question')
    expect(leadingTag(['key-point', 'confused'])).toBe('confused')
    expect(leadingTag([])).toBeUndefined()
  })

  it('a sorted confusing moment reads as sorted', () => {
    expect(leadingTag(['confused', 'sorted', 'key-point'])).toBe('sorted')
  })
})
