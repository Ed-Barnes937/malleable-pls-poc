import { describe, expect, it } from 'vitest'
import { momentSourceLabel } from './StudyBlockPopover'

describe('momentSourceLabel', () => {
  it('keeps the time with the last word of the title, so "1:18" never wraps onto a line of its own', () => {
    expect(momentSourceLabel('Mitochondrial DNA - today', 78_313)).toBe('From Mitochondrial DNA - today · 1:18')
  })

  it('leaves a label without a time alone', () => {
    expect(momentSourceLabel('Mitochondrial DNA - today', null)).toBe('From Mitochondrial DNA - today')
  })
})
