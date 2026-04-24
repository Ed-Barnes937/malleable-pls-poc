import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('does not render when open is false', () => {
    render(
      <Dialog open={false} onClose={() => {}}>
        <p>Hidden content</p>
      </Dialog>,
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('renders children when open is true', () => {
    render(
      <Dialog open={true} onClose={() => {}}>
        <p>Visible content</p>
      </Dialog>,
    )
    expect(screen.getByText('Visible content')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="My Dialog">
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByText('My Dialog')).toBeInTheDocument()
  })

  it('has role="dialog" and aria-modal="true"', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="My Dialog">
        <p>body</p>
      </Dialog>,
    )
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
  })

  it('uses title as aria-label', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Pick a color">
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Pick a color' })).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <Dialog open={true} onClose={onClose} title="t">
        <p>body</p>
      </Dialog>,
    )
    const backdrop = screen.getByTestId('dialog-backdrop')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when content is clicked', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open={true} onClose={onClose} title="t">
        <p>body-text</p>
      </Dialog>,
    )
    await userEvent.click(screen.getByText('body-text'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(
      <Dialog open={true} onClose={onClose} title="t">
        <p>body</p>
      </Dialog>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not fire Escape handler when closed', () => {
    const onClose = vi.fn()
    render(
      <Dialog open={false} onClose={onClose}>
        <p>body</p>
      </Dialog>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders a close button that triggers onClose', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open={true} onClose={onClose} title="t">
        <p>body</p>
      </Dialog>,
    )
    const closeBtn = screen.getByRole('button', { name: /close/i })
    await userEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
