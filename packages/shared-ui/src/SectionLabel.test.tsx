import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('renders children text', () => {
    render(<SectionLabel>Overview</SectionLabel>)
    expect(screen.getByText('Overview')).toBeInTheDocument()
  })

  it('accepts className prop', () => {
    const { container } = render(<SectionLabel className="custom-class">Overview</SectionLabel>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('custom-class')
  })

  it('is a sentence-case meta label, not an uppercase one', () => {
    const { container } = render(<SectionLabel>Hello</SectionLabel>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-meta')
    expect(el.className).not.toContain('uppercase')
  })
})
