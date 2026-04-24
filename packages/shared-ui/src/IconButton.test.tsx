import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { IconButton } from './IconButton'

function TestIcon({ className }: { className?: string }) {
  return <svg data-testid="test-icon" className={className} />
}

describe('IconButton', () => {
  it('renders the provided icon', () => {
    render(<IconButton icon={TestIcon} label="Close" />)
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('has the correct aria-label', () => {
    render(<IconButton icon={TestIcon} label="Close" />)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<IconButton icon={TestIcon} label="Close" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('supports disabled state', () => {
    render(<IconButton icon={TestIcon} label="Close" disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    render(<IconButton icon={TestIcon} label="Close" disabled onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies sm size by default', () => {
    render(<IconButton icon={TestIcon} label="Close" />)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/h-7|h-6|h-5/)
  })

  it('applies md size variant', () => {
    render(<IconButton icon={TestIcon} label="Close" size="md" />)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/h-9|h-8/)
  })

  it('forwards additional button props like type', () => {
    render(<IconButton icon={TestIcon} label="Submit" type="submit" />)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
