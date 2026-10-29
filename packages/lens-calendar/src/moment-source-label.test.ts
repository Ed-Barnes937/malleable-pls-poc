import { describe, expect, it } from 'vitest'
import { momentSourceLabel, momentSourceParts } from './StudyBlockPopover'

const NBSP = ' '

describe('momentSourceLabel', () => {
  it('keeps the time with the last word of the title, so "1:18" never wraps onto a line of its own', () => {
    expect(momentSourceLabel('Mitochondrial DNA - today', 78_313)).toBe(`From Mitochondrial DNA - today${NBSP}·${NBSP}1:18`)
  })

  it('leaves a label without a time alone', () => {
    expect(momentSourceLabel('Mitochondrial DNA - today', null)).toBe('From Mitochondrial DNA - today')
  })
})

describe('momentSourceParts', () => {
  it('keeps a spaced dash with the words either side and the time, so no line ends or starts on "-"', () => {
    expect(momentSourceParts(momentSourceLabel('Mitochondrial DNA - today', 78_313)))
      .toEqual(['From Mitochondrial ', `DNA - today${NBSP}·${NBSP}1:18`])
  })

  it('keeps just the last word and the time together otherwise', () => {
    expect(momentSourceParts(momentSourceLabel('Biology Lecture: Mitochondrial DNA', 540_000)))
      .toEqual(['From Biology Lecture: Mitochondrial ', `DNA${NBSP}·${NBSP}9:00`])
    expect(momentSourceParts('From Cell biology')).toEqual(['From Cell ', 'biology'])
  })
})
