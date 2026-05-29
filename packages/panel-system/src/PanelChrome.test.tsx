import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PanelChrome } from './PanelChrome'

/**
 * The package PanelChrome diverges from the POC version:
 * - It takes an `icon` ComponentType prop instead of a `type` string that maps
 *   to an internal icon registry. Icon resolution by panel type now lives in
 *   CanvasEngine (via getIcon), so tests for type-driven icons are dropped.
 * - It has no internal placeholder/lens content. When no children are passed,
 *   the content area is empty, so the "renders placeholder content" assertion
 *   is dropped.
 */

function StarIcon(props: { className?: string }) {
  return <span data-testid="custom-icon" {...props}>★</span>
}

describe('PanelChrome', () => {
  it('renders the title text', () => {
    render(<PanelChrome title="Meeting Notes" />)
    expect(screen.getByTestId('panel-title')).toHaveTextContent('Meeting Notes')
  })

  it('renders "Untitled" when no title is provided', () => {
    render(<PanelChrome />)
    expect(screen.getByTestId('panel-title')).toHaveTextContent('Untitled')
  })

  it('renders a fallback icon when no icon prop is provided', () => {
    render(<PanelChrome title="Test" />)
    expect(screen.getByTestId('panel-icon')).toBeInTheDocument()
  })

  it('renders the provided icon component', () => {
    render(<PanelChrome title="Test" icon={StarIcon} />)
    expect(screen.getByTestId('panel-icon')).toBeInTheDocument()
    expect(screen.getByTestId('panel-icon')).toHaveTextContent('★')
  })

  it('renders a close button', () => {
    render(<PanelChrome title="Test" />)
    expect(screen.getByTestId('panel-close')).toBeInTheDocument()
  })

  it('fires onClose callback when close button is clicked', () => {
    const onClose = vi.fn()
    render(<PanelChrome title="Test" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('panel-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('close button stops click propagation (does not trigger parent handlers)', () => {
    const parentHandler = vi.fn()
    const onClose = vi.fn()
    render(
      <div onClick={parentHandler}>
        <PanelChrome title="Test" onClose={onClose} />
      </div>,
    )
    fireEvent.click(screen.getByTestId('panel-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(parentHandler).not.toHaveBeenCalled()
  })

  it('close button stops pointerDown propagation (does not trigger drag)', () => {
    const headerPointerDown = vi.fn()
    render(
      <div onPointerDown={headerPointerDown}>
        <PanelChrome title="Test" onClose={vi.fn()} />
      </div>,
    )
    fireEvent.pointerDown(screen.getByTestId('panel-close'))
    expect(headerPointerDown).not.toHaveBeenCalled()
  })

  it('renders children in the content area', () => {
    render(
      <PanelChrome title="Test">
        <div data-testid="custom-content">Hello</div>
      </PanelChrome>,
    )
    expect(screen.getByTestId('custom-content')).toBeInTheDocument()
    expect(screen.getByTestId('panel-content')).toContainElement(
      screen.getByTestId('custom-content'),
    )
  })

  it('content area click events are not swallowed', () => {
    const contentClick = vi.fn()
    render(
      <PanelChrome title="Test">
        <button type="button" onClick={contentClick} data-testid="inner-btn">
          Click me
        </button>
      </PanelChrome>,
    )
    fireEvent.click(screen.getByTestId('inner-btn'))
    expect(contentClick).toHaveBeenCalledTimes(1)
  })

  it('calls onDragHandlePointerDown when header receives pointerDown', () => {
    const onDragHandlePointerDown = vi.fn()
    render(
      <PanelChrome title="Test" onDragHandlePointerDown={onDragHandlePointerDown} />,
    )
    fireEvent.pointerDown(screen.getByTestId('panel-header'))
    expect(onDragHandlePointerDown).toHaveBeenCalledTimes(1)
  })

  it('header is visually distinct from content (divider + background tint)', () => {
    render(<PanelChrome title="Test" />)
    const header = screen.getByTestId('panel-header')
    expect(header.className).toContain('border-b')
    expect(header.className).toContain('border-border-subtle')
    expect(header.className).toContain('bg-surface-overlay/50')
  })
})
