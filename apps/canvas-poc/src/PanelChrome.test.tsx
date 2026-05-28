import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PanelChrome } from './PanelChrome'

describe('PanelChrome', () => {
  it('renders the title text', () => {
    render(<PanelChrome title="Meeting Notes" type="document" />)
    expect(screen.getByTestId('panel-title')).toHaveTextContent('Meeting Notes')
  })

  it('renders "Untitled" when no title is provided', () => {
    render(<PanelChrome />)
    expect(screen.getByTestId('panel-title')).toHaveTextContent('Untitled')
  })

  it('renders an icon for the given panel type', () => {
    render(<PanelChrome title="Test" type="audio" />)
    expect(screen.getByTestId('panel-icon')).toBeInTheDocument()
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

  it('renders placeholder content when no children are provided', () => {
    render(<PanelChrome title="Test" type="document" />)
    const content = screen.getByTestId('panel-content')
    expect(content.children.length).toBeGreaterThan(0)
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

  it('renders distinct icons for different panel types', () => {
    const { unmount: u1 } = render(<PanelChrome title="A" type="document" />)
    const docIcon = screen.getByTestId('panel-icon').innerHTML
    u1()

    const { unmount: u2 } = render(<PanelChrome title="B" type="audio" />)
    const audioIcon = screen.getByTestId('panel-icon').innerHTML
    u2()

    // Different panel types should produce different icon markup
    expect(docIcon).not.toBe(audioIcon)
  })
})
