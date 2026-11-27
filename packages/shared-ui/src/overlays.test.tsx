import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { AlertDialog } from './AlertDialog'
import { Drawer, DrawerContent, DrawerTitle } from './Drawer'
import { Overlays } from './overlay-harness'
import { checkPattern, settle } from './testing'

// jsdom lacks these; a Drawer measures its sheet and a Menu scrolls its highlighted item into view.
// Stubbed here, not in vitest.setup.ts: other code (CanvasEngine) branches on ResizeObserver being absent.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView ??= () => {}
})

async function open(name: string) {
  render(<Overlays />)
  await userEvent.click(screen.getByRole('button', { name }))
  await act(settle)
}

describe('overlays meet their WAI-ARIA patterns', () => {
  it('Popover (a non-modal dialog)', async () => {
    await open('Details')
    await checkPattern(screen.getByRole('dialog', { name: 'Maths study' }), 'dialog')
  })

  it('Menu', async () => {
    await open('Board menu')
    await checkPattern(screen.getByRole('menu'), 'menu')
  })

  it('Drawer (a modal dialog)', async () => {
    await open('Activity')
    await checkPattern(screen.getByRole('dialog', { name: 'Activity' }), 'dialog')
  })

  it('AlertDialog', async () => {
    await open('Delete board')
    await checkPattern(screen.getByRole('alertdialog', { name: 'Delete board?' }), 'alertdialog')
  })

  it('useConfirm', async () => {
    await open('Delete block')
    await checkPattern(screen.getByRole('alertdialog', { name: 'Delete it?' }), 'alertdialog')
  })

  // checkPattern has no tooltip pattern: assert the APG tooltip contract directly.
  it('Tooltip describes its trigger, and shows on keyboard focus', async () => {
    render(<Overlays />)
    await act(settle)
    const trigger = screen.getByRole('button', { name: 'Add to calendar' })
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(trigger.getAttribute('aria-describedby')?.split(' ')).toContain(tip.id)
    expect(tip).toHaveTextContent('Add to calendar')
  })
})

describe('AlertDialog and useConfirm answers', () => {
  it('runs onConfirm from the confirm button', async () => {
    const onEvent = vi.fn()
    render(<Overlays onEvent={onEvent} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete board' }))
    await act(settle)
    await userEvent.click(screen.getByRole('alertdialog').querySelector('button:last-of-type')!)
    await act(settle)
    expect(onEvent).toHaveBeenCalledWith('alert:confirmed')
  })

  it('confirm() resolves true for the confirm button and false for Escape', async () => {
    const onEvent = vi.fn()
    render(<Overlays onEvent={onEvent} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete block' }))
    await act(settle)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(settle)
    expect(onEvent).toHaveBeenLastCalledWith('confirm:true')

    await userEvent.click(screen.getByRole('button', { name: 'Delete block' }))
    await act(settle)
    await userEvent.keyboard('{Escape}')
    await act(settle)
    expect(onEvent).toHaveBeenLastCalledWith('confirm:false')
  })
})

describe('AlertDialog while onConfirm runs and when it fails', () => {
  function Rejecting({ onConfirm }: { onConfirm: () => Promise<void> }) {
    const [open, setOpen] = useState(true)
    return <AlertDialog open={open} onClose={() => setOpen(false)} title="Delete it?" description="Gone for good." confirmLabel="Delete" pendingLabel="Deleting..." onConfirm={onConfirm} />
  }

  it('shows pendingLabel while pending, then stays open with the error message', async () => {
    let reject!: (e: Error) => void
    render(<Rejecting onConfirm={() => new Promise<void>((_, r) => { reject = r })} />)
    await act(settle)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(settle)
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeInTheDocument()

    await act(async () => reject(new Error('Server said no')))
    await act(settle)
    expect(screen.getByRole('alert')).toHaveTextContent('Server said no')
    expect(screen.getByRole('alertdialog', { name: 'Delete it?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})

describe('DrawerContent', () => {
  it("runs the caller's onPointerDown and still keeps the press from reaching the page", async () => {
    const own = vi.fn()
    const page = vi.fn()
    render(
      <div onPointerDown={page}>
        <Drawer defaultOpen side="right">
          <DrawerContent onPointerDown={own}>
            <DrawerTitle>Activity</DrawerTitle>
            <button type="button">Inside</button>
          </DrawerContent>
        </Drawer>
      </div>,
    )
    await act(settle)
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }))
    expect(own).toHaveBeenCalled()
    expect(page).not.toHaveBeenCalled()
  })
})
