import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TopBar } from './TopBar'

describe('TopBar', () => {
  it('renders the top bar element', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
  })

  it('renders the drawer trigger button with accessible label', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    const trigger = screen.getByTestId('drawer-trigger')
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-label', 'Toggle drawer')
  })

  it('calls onMenuClick when drawer trigger is clicked', () => {
    const onMenuClick = vi.fn()
    render(<TopBar onMenuClick={onMenuClick} onAddPanel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('drawer-trigger'))
    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })

  it('renders the hardcoded workspace name', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    expect(screen.getByTestId('workspace-name')).toHaveTextContent('My Workspace')
  })

  it('renders the hardcoded scope chip', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    expect(screen.getByTestId('scope-chip')).toHaveTextContent('All items')
  })

  it('renders the add panel button with accessible label', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    const addBtn = screen.getByTestId('add-panel-button')
    expect(addBtn).toBeInTheDocument()
    expect(addBtn).toHaveAttribute('aria-label', 'Add panel')
  })

  it('calls onAddPanel when add button is clicked', () => {
    const onAddPanel = vi.fn()
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={onAddPanel} />)
    fireEvent.click(screen.getByTestId('add-panel-button'))
    expect(onAddPanel).toHaveBeenCalledTimes(1)
  })

  it('uses warm surface background from design tokens', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    const topBar = screen.getByTestId('top-bar')
    expect(topBar.style.background).toBe('var(--color-surface-raised)')
  })

  it('applies panel shadow for subtle elevation', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    const topBar = screen.getByTestId('top-bar')
    expect(topBar.style.boxShadow).toBe('var(--shadow-panel)')
  })

  it('uses the transition-panel token for transitions', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    const topBar = screen.getByTestId('top-bar')
    expect(topBar.style.transition).toBe('var(--transition-panel)')
  })

  it('add button displays "Add" text', () => {
    render(<TopBar onMenuClick={vi.fn()} onAddPanel={vi.fn()} />)
    expect(screen.getByTestId('add-panel-button')).toHaveTextContent('Add')
  })
})
