import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmptyState } from './EmptyState'

function TestIcon({ className }: { className?: string }) {
  return <svg data-testid="empty-icon" className={className} />
}

describe('EmptyState', () => {
  it('renders the message text', () => {
    render(<EmptyState message="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<EmptyState message="empty" icon={TestIcon} />)
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
  })

  it('does not render icon when not provided', () => {
    render(<EmptyState message="empty" />)
    expect(screen.queryByTestId('empty-icon')).not.toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(
      <EmptyState message="empty" action={<button>Create</button>} />,
    )
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('does not render action container when not provided', () => {
    render(<EmptyState message="empty" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('is backward compatible (renders with only message)', () => {
    const { container } = render(<EmptyState message="Still here" />)
    expect(container.firstChild).toBeTruthy()
    expect(screen.getByText('Still here')).toBeInTheDocument()
  })
})
