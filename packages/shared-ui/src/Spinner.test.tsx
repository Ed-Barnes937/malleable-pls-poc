import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('renders without crashing', () => {
    const { container } = render(<Spinner />)
    expect(container.firstChild).toBeTruthy()
  })

  it('applies md size by default', () => {
    const { container } = render(<Spinner />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/h-5/)
    expect(el.className).toMatch(/w-5/)
  })

  it('applies sm size classes', () => {
    const { container } = render(<Spinner size="sm" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/h-3/)
    expect(el.className).toMatch(/w-3/)
  })

  it('applies lg size classes', () => {
    const { container } = render(<Spinner size="lg" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/h-8/)
    expect(el.className).toMatch(/w-8/)
  })

  it('accepts className prop', () => {
    const { container } = render(<Spinner className="text-red-500" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-red-500')
  })

  it('has animate-spin class', () => {
    const { container } = render(<Spinner />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('animate-spin')
  })
})
