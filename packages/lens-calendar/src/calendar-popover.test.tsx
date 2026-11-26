import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { checkPattern, settle } from '@pls/shared-ui/src/testing'
import { CalendarPopover, anchorShift, pressPlacement } from './calendar-popover'
import type { PlanItemOccurrence } from '@pls/substrate'
import { SubstrateProvider, type SubstrateReader, type SubstrateWriter } from '@pls/lens-framework'
import { EventPopover } from './EventPopover'
import { StudyBlockPopover } from './StudyBlockPopover'
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

  it("given the block's sides (placed again with no press), sits beside the whole block, never over it", () => {
    // Room right of the point, but not right of the whole block: beside it on its left.
    expect(pressPlacement({ clientX: 495, width: 300, viewportWidth: 858, from: { left: 440, right: 550 } })).toBe('beside')
    // Room on neither side of the whole block, though there is beside the point.
    expect(pressPlacement({ clientX: 200, width: 300, viewportWidth: 858, from: { left: 150, right: 600 } })).toBe('vertical')
    expect(pressPlacement({ clientX: 200, width: 300, viewportWidth: 858 })).toBe('beside')
  })

  it("given the block's sides with no room beside it, goes above or below the block", () => {
    expect(pressPlacement({ clientX: 185, width: 340, viewportWidth: 370, from: { left: 20, right: 350 } })).toBe('vertical')
  })
})

describe('anchorShift', () => {
  const base = { anchorBefore: 200, heightBefore: 360, pinned: 'top' as const }

  it('keeps the anchor where it is when content above it grows (the popover grows upward)', () => {
    // The anchor was 200px down and is now 280px down: the top moves up by 80.
    expect(anchorShift({ ...base, anchorAfter: 280, heightAfter: 440 })).toBe(-80)
  })

  it('keeps the anchor where it is when content above it goes (the popover shrinks upward)', () => {
    expect(anchorShift({ ...base, anchorAfter: 120, heightAfter: 280 })).toBe(80)
  })

  it('leaves the top alone when only what is below the anchor changes', () => {
    expect(anchorShift({ ...base, anchorAfter: 200, heightAfter: 420 })).toBe(0)
  })

  it('above what was pressed (its bottom held still), counts the move the popover makes on its own', () => {
    // Content above the anchor grows: the top already moves up with it.
    expect(anchorShift({ ...base, pinned: 'bottom', anchorAfter: 280, heightAfter: 440 })).toBe(0)
    // Content below it grows: the top would move up and take the anchor with it.
    expect(anchorShift({ ...base, pinned: 'bottom', anchorAfter: 200, heightAfter: 420 })).toBe(60)
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

const none = () => ({ data: undefined, isLoading: false, error: null })
const reader = { useRecording: none, useTranscript: none, useTags: none, useAutomation: none } as unknown as SubstrateReader

describe('the study block popover', () => {
  it('is a dialog named by the block (WAI-ARIA dialog pattern)', async () => {
    const row = {
      id: 'review', occurrence_key: 'review', kind: 'task', title: 'Review: maternal inheritance', status: 'open', course: 'biology',
      starts_at: '2026-11-25T20:00:00.000Z', ends_at: '2026-11-25T20:30:00.000Z', duration_min: 30,
      source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000,
    } as PlanItemOccurrence
    function Block() {
      const root = useRef<HTMLDivElement>(null)
      const opener = useRef<HTMLButtonElement>(null)
      const [open, setOpen] = useState(true)
      return (
        <div ref={root}>
          <button ref={opener} type="button">Block</button>
          <CalendarPopover open={open} root={root} press={{ x: 100, y: 100 }} width={340} label={row.title} variant="study-block" finalFocus={() => opener.current} onClose={() => setOpen(false)} onClosed={() => {}}>
            <StudyBlockPopover row={row} canShowMoment canEdit onGoToMoment={() => {}} onEditTime={() => {}} onClose={() => setOpen(false)} />
          </CalendarPopover>
          {/* The rest of the board, where Tab goes after the popover. */}
          <button type="button">Next week</button>
        </div>
      )
    }
    render(<SubstrateProvider reader={reader} writer={{} as SubstrateWriter}><Block /></SubstrateProvider>)
    await act(settle)
    await checkPattern(screen.getByRole('dialog', { name: 'Review: maternal inheritance' }), 'dialog')
  })
})
