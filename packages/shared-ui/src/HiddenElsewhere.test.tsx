import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HiddenElsewhere, hiddenElsewhereCount, hiddenElsewhereParts } from './HiddenElsewhere'

describe('hiddenElsewhereCount', () => {
  it('is the difference between unscoped and scoped counts', () => {
    expect(hiddenElsewhereCount(1, 3)).toBe(2)
  })

  it('never goes negative', () => {
    expect(hiddenElsewhereCount(3, 1)).toBe(0)
  })
})

describe('hiddenElsewhereParts', () => {
  it('separates items with no course from items in other courses', () => {
    expect(hiddenElsewhereParts(1, 4, 1)).toEqual({ otherCourses: 2, noCourse: 1 })
  })

  it('never reports more untagged items than are hidden', () => {
    expect(hiddenElsewhereParts(2, 3, 5)).toEqual({ otherCourses: 0, noCourse: 1 })
  })
})

describe('HiddenElsewhere', () => {
  it('reports untagged items truthfully, not as other courses', () => {
    render(<HiddenElsewhere scopedCount={1} unscopedCount={4} noCourseCount={1} />)
    expect(screen.getByText('+2 in other courses · 1 with no course')).toBeInTheDocument()
  })

  it('says only "with no course" when nothing is in another course', () => {
    render(<HiddenElsewhere scopedCount={1} unscopedCount={2} noCourseCount={1} />)
    expect(screen.getByText('+1 with no course')).toBeInTheDocument()
  })

  it('says how many items other courses hold', () => {
    render(<HiddenElsewhere scopedCount={1} unscopedCount={2} />)
    expect(screen.getByText('+1 in other courses')).toBeInTheDocument()
  })

  it('renders nothing when the filter hides nothing', () => {
    const { container } = render(<HiddenElsewhere scopedCount={2} unscopedCount={2} />)
    expect(container).toBeEmptyDOMElement()
  })
})
