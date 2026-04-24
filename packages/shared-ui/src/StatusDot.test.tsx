import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusDot } from './StatusDot'

describe('StatusDot', () => {
  it('renders with running status', () => {
    const { container } = render(<StatusDot status="running" />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with complete status', () => {
    const { container } = render(<StatusDot status="complete" />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with failed status', () => {
    const { container } = render(<StatusDot status="failed" />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with idle status', () => {
    const { container } = render(<StatusDot status="idle" />)
    expect(container.firstChild).toBeTruthy()
  })

  it('has pulse animation when status is running', () => {
    const { container } = render(<StatusDot status="running" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('animate-pulse')
  })

  it('has no pulse when status is complete', () => {
    const { container } = render(<StatusDot status="complete" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).not.toContain('animate-pulse')
  })

  it('supports custom pulse override to force on', () => {
    const { container } = render(<StatusDot status="idle" pulse />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('animate-pulse')
  })

  it('supports custom pulse override to force off', () => {
    const { container } = render(<StatusDot status="running" pulse={false} />)
    const el = container.firstChild as HTMLElement
    expect(el.className).not.toContain('animate-pulse')
  })

  it('accepts className prop', () => {
    const { container } = render(<StatusDot status="idle" className="extra-class" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('extra-class')
  })

  it('uses different color classes per status', () => {
    const { container: c1 } = render(<StatusDot status="running" />)
    const { container: c2 } = render(<StatusDot status="complete" />)
    const { container: c3 } = render(<StatusDot status="failed" />)
    const cls1 = (c1.firstChild as HTMLElement).className
    const cls2 = (c2.firstChild as HTMLElement).className
    const cls3 = (c3.firstChild as HTMLElement).className
    expect(cls1).not.toBe(cls2)
    expect(cls2).not.toBe(cls3)
    expect(cls1).not.toBe(cls3)
  })
})
