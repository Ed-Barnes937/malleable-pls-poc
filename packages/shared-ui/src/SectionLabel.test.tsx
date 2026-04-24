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

  it('applies uppercase/tracking styles', () => {
    const { container } = render(<SectionLabel>Hello</SectionLabel>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('uppercase')
    expect(el.className).toContain('tracking-widest')
  })
})
