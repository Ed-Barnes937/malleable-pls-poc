import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { App } from './App'

describe('App', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders the Canvas POC heading', () => {
    render(<App />)
    expect(screen.getByText('Canvas POC')).toBeInTheDocument()
  })

  it('renders a theme toggle button', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /switch to/i })).toBeInTheDocument()
  })

  it('starts in dark mode', () => {
    render(<App />)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggles to light mode when theme button is clicked', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('toggles back to dark mode on second click', async () => {
    render(<App />)
    const button = screen.getByRole('button', { name: 'Switch to light mode' })
    await userEvent.click(button)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('renders the canvas area', () => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
