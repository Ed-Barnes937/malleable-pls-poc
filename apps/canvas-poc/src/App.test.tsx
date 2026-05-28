import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { App } from './App'
import { useCanvasStore } from './canvas-store'

describe('App', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    useCanvasStore.setState({ panels: [] })
  })

  it('renders the top bar with workspace name', () => {
    render(<App />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-name')).toHaveTextContent('My Workspace')
  })

  it('renders the scope chip', () => {
    render(<App />)
    expect(screen.getByTestId('scope-chip')).toHaveTextContent('All items')
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

  it('renders the drawer trigger button', () => {
    render(<App />)
    expect(screen.getByTestId('drawer-trigger')).toBeInTheDocument()
  })

  it('renders the add panel button', () => {
    render(<App />)
    expect(screen.getByTestId('add-panel-button')).toBeInTheDocument()
  })
})
