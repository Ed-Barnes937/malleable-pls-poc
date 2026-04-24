import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('renders with role="switch"', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('reflects aria-checked=true when checked', () => {
    render(<Switch checked={true} onCheckedChange={() => {}} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('reflects aria-checked=false when unchecked', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onCheckedChange with toggled value when clicked', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('calls onCheckedChange with false when unchecking', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch checked={true} onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('supports disabled state', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} disabled />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('does not fire onCheckedChange when disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} disabled />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('has an accessible label when label prop provided', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} label="Enable notifications" />)
    expect(screen.getByRole('switch', { name: 'Enable notifications' })).toBeInTheDocument()
  })

  it('accepts className prop', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} className="custom-class" />)
    expect(screen.getByRole('switch').className).toContain('custom-class')
  })
})
