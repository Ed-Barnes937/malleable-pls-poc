import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { HiddenElsewhere, hiddenElsewhereCount } from './HiddenElsewhere'

describe('hiddenElsewhereCount', () => {
  it('is the difference between unscoped and scoped counts', () => {
    expect(hiddenElsewhereCount(1, 3)).toBe(2)
  })

  it('never goes negative', () => {
    expect(hiddenElsewhereCount(3, 1)).toBe(0)
  })
})

describe('HiddenElsewhere', () => {
  it('says how many items other courses hold', () => {
    render(<HiddenElsewhere scopedCount={1} unscopedCount={2} />)
    expect(screen.getByText('+1 in other courses')).toBeInTheDocument()
  })

  it('renders nothing when the filter hides nothing', () => {
    const { container } = render(<HiddenElsewhere scopedCount={2} unscopedCount={2} />)
    expect(container).toBeEmptyDOMElement()
  })
})
