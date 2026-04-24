import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from './Badge'

function TestIcon({ className }: { className?: string }) {
  return <svg data-testid="badge-icon" className={className} />
}

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Hello</Badge>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('applies the accent variant classes', () => {
    const { container } = render(<Badge variant="accent">A</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-accent')
  })

  it('applies the success variant classes', () => {
    const { container } = render(<Badge variant="success">S</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/emerald/)
  })

  it('renders icon when provided', () => {
    render(<Badge icon={TestIcon}>tag</Badge>)
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument()
  })

  it('does not render icon slot when no icon passed', () => {
    render(<Badge>plain</Badge>)
    expect(screen.queryByTestId('badge-icon')).not.toBeInTheDocument()
  })

  it('applies sm size by default (text-[10px])', () => {
    const { container } = render(<Badge>sm</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-[10px]')
  })

  it('applies md size variant', () => {
    const { container } = render(<Badge size="md">md</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/text-xs|text-sm/)
  })

  it('applies ring class when ring=true', () => {
    const { container } = render(<Badge ring>ringed</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('ring-1')
  })

  it('accepts className prop', () => {
    const { container } = render(<Badge className="extra">x</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('extra')
  })
})
