import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { checkPattern, settle } from '@pls/shared-ui/src/testing'
import { CalendarPopover, pressPlacement } from './calendar-popover'
import { EventPopover } from './EventPopover'
import type { Draft } from './drafts'

describe('pressPlacement', () => {
  it('sits beside the press when there is room on either side', () => {
    expect(pressPlacement({ clientX: 200, width: 300, viewportWidth: 1440 })).toBe('beside')
    // Near the right edge it still sits beside (UI SDK flips it to the left).
    expect(pressPlacement({ clientX: 1300, width: 300, viewportWidth: 1440 })).toBe('beside')
  })

  it('goes above or below what was pressed when beside would cover the press (a phone)', () => {
    expect(pressPlacement({ clientX: 200, width: 340, viewportWidth: 400 })).toBe('vertical')
  })
})

const draft: Draft = {
  kind: 'commitment', title: '', start: new Date(2026, 10, 25, 14), end: new Date(2026, 10, 25, 15), course: null, repeatsWeekly: false,
}

function Harness({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  const close = () => {
    setOpen(false)
    onClose()
  }
  return (
    <div ref={root}>
      <button ref={opener} type="button">Outside</button>
      <CalendarPopover open={open} root={root} press={{ x: 100, y: 100 }} width={300} label="Add to calendar" finalFocus={() => opener.current} onClose={close} onClosed={() => {}}>
        <EventPopover initial={draft} canEdit onSubmit={() => {}} onClose={close} />
      </CalendarPopover>
    </div>
  )
}

describe('CalendarPopover', () => {
  it('the create popover is a named dialog (WAI-ARIA dialog pattern)', async () => {
    render(<Harness onClose={() => {}} />)
    await act(settle)
    await checkPattern(screen.getByRole('dialog', { name: 'Add to calendar' }), 'dialog')
  })

  it('Escape closes it; focus leaving and an outside press leave closing to the calendar', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await act(settle)
    const outside = screen.getByRole('button', { name: 'Outside' })
    fireEvent.pointerDown(outside)
    fireEvent.mouseDown(outside)
    fireEvent.click(outside)
    outside.focus()
    await act(settle)
    expect(onClose).not.toHaveBeenCalled()

    screen.getByLabelText('Title').focus()
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
    await act(settle)
    expect(onClose).toHaveBeenCalledTimes(1)
    // Focus goes back to what opened it.
    expect(outside).toHaveFocus()
  })
})
