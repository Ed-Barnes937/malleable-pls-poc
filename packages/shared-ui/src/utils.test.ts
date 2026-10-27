import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps a type token next to a text colour', () => {
    expect(cn('text-meta text-text-muted')).toBe('text-meta text-text-muted')
    expect(cn('text-body', 'text-course-biology-ink')).toBe('text-body text-course-biology-ink')
  })

  it('lets a later type token replace an earlier one', () => {
    expect(cn('text-meta', 'text-title')).toBe('text-title')
    expect(cn('text-xs', 'text-body')).toBe('text-body')
  })

  it('treats radius and shadow tokens as radius and shadow', () => {
    expect(cn('rounded-md', 'rounded-item')).toBe('rounded-item')
    expect(cn('shadow-panel', 'shadow-pop')).toBe('shadow-pop')
    expect(cn('rounded-item shadow-pop')).toBe('rounded-item shadow-pop')
  })
})
