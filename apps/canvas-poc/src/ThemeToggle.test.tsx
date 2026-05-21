import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('renders a button with accessible label for dark mode', () => {
    render(<ThemeToggle theme="dark" onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  })

  it('renders a button with accessible label for light mode', () => {
    render(<ThemeToggle theme="light" onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('shows "Light" text when in dark mode', () => {
    render(<ThemeToggle theme="dark" onToggle={() => {}} />)
    expect(screen.getByText('Light')).toBeInTheDocument()
  })

  it('shows "Dark" text when in light mode', () => {
    render(<ThemeToggle theme="light" onToggle={() => {}} />)
    expect(screen.getByText('Dark')).toBeInTheDocument()
  })

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn()
    render(<ThemeToggle theme="dark" onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
