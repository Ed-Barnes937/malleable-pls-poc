import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { checkPattern, settle } from '@pls/shared-ui/src/testing'
import { CalendarPopover, anchoredTop, popoverTop, pressPlacement, usePlacedTop } from './calendar-popover'
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

// Where its top goes (px below the calendar's top), as main placed it. On a
// phone (vertical) it is kept inside the calendar panel, inside the window
// (main's rule in full); on desktop (beside), inside the window only, so it may
// spill past the calendar (K3 decision 7). Both see the same calendar: 640px
// tall, its top at the top of an 860px-tall window.
const frame = { calendarTop: 0, calendarHeight: 640, viewportHeight: 860 }

describe('popoverTop', () => {
  it('beside the point, a little above it, when there is room', () => {
    expect(popoverTop({ placement: 'beside', y: 300, height: 320, ...frame })).toBe(276)
  })

  it('beside a point low in the window, it is kept inside the window, still beside it', () => {
    expect(popoverTop({ placement: 'beside', y: 600, height: 320, ...frame })).toBe(532)
  })

  it('beside the point, the block pressed makes no difference', () => {
    expect(popoverTop({ placement: 'beside', y: 300, span: { top: 280, bottom: 360 }, height: 320, ...frame })).toBe(276)
  })

  it('beside, it spills past the bottom of a calendar shorter than the window, kept inside the window only', () => {
    // A 400px-tall calendar 100px down a 900px window: its bottom is 400px below its top.
    const top = popoverTop({ placement: 'beside', y: 360, height: 320, calendarTop: 100, calendarHeight: 400, viewportHeight: 900 })
    expect(top).toBe(336)
    expect(top + 320).toBeGreaterThan(400)
  })

  it('on a phone, goes above the block pressed when there is room, clear of all of it', () => {
    const span = { top: 520, bottom: 580 }
    const top = popoverTop({ placement: 'vertical', y: 560, span, height: 360, ...frame })
    expect(top).toBe(148)
    expect(top + 360).toBeLessThan(span.top)
  })

  it('on a phone, goes below the block pressed when only that fits', () => {
    expect(popoverTop({ placement: 'vertical', y: 120, span: { top: 100, bottom: 160 }, height: 360, ...frame })).toBe(172)
  })

  it('on a phone, covers the block (kept inside the calendar) only when neither above nor below fits', () => {
    expect(popoverTop({ placement: 'vertical', y: 330, span: { top: 300, bottom: 360 }, height: 360, ...frame })).toBe(272)
  })

  it('with no block (a due marker), keeps clear of the point itself', () => {
    expect(popoverTop({ placement: 'vertical', y: 560, height: 360, ...frame })).toBe(188)
  })

  it('above only if it fits inside the bounds: a calendar scrolled partly off the window goes below', () => {
    // The window cuts the calendar's top 200px off: 148 would be off screen.
    expect(popoverTop({ placement: 'vertical', y: 560, span: { top: 520, bottom: 580 }, height: 340, calendarTop: -200, calendarHeight: 1100, viewportHeight: 900 })).toBe(592)
  })
})

describe('anchoredTop', () => {
  const base = { placement: 'vertical', top: 200, height: 360, ...frame } as const

  it('keeps the anchor where it is when content above it grows (the popover grows upward)', () => {
    // The anchor was 200px down and is now 280px down: the top moves up by 80.
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 280, height: 440 })).toBe(120)
  })

  it('keeps the anchor where it is when content above it goes (the popover shrinks upward)', () => {
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 120, height: 280 })).toBe(280)
  })

  it('leaves the top alone when only what is below the anchor changes', () => {
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 200, height: 420 })).toBe(200)
  })

  it('on a phone, moves the anchor only as far as keeping the popover inside the calendar needs', () => {
    // Growing upward by 240 would put the top at -40: held at the margin.
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 440, height: 600 })).toBe(8)
    // Growing downward past the calendar's bottom edge: held to it.
    expect(anchoredTop({ ...base, anchorBefore: 200, anchorAfter: 200, height: 500 })).toBe(132)
  })

  it('beside, moves the anchor only as far as keeping the popover inside the window needs', () => {
    // Growing downward past the calendar's bottom is fine: the window's is not.
    expect(anchoredTop({ ...base, placement: 'beside', anchorBefore: 200, anchorAfter: 200, height: 500 })).toBe(200)
    expect(anchoredTop({ ...base, placement: 'beside', anchorBefore: 200, anchorAfter: 200, height: 700 })).toBe(152)
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

describe('usePlacedTop', () => {
  /** A popover whose height and buttons' offset the test sets, as its content loads. */
  function content(height: number, anchor: number) {
    const el = document.createElement('div')
    const row = document.createElement('div')
    row.setAttribute('data-popover-anchor', '')
    el.append(row)
    const size = { height, anchor }
    Object.defineProperty(el, 'offsetHeight', { get: () => size.height })
    Object.defineProperty(el, 'scrollHeight', { get: () => size.height })
    Object.defineProperty(el, 'clientHeight', { get: () => size.height })
    Object.defineProperty(row, 'offsetTop', { get: () => size.anchor })
    Object.defineProperty(row, 'offsetParent', { get: () => el })
    return { el, size }
  }
  const box = (width: number, height: number) => ({ top: 0, width, height }) as DOMRect

  it("keeps its buttons where they were when the calendar's box changes after the content grew", () => {
    const p = content(300, 100)
    const at = { placement: 'beside' as const, y: 200, span: { top: 190, bottom: 240 } }
    const { result } = renderHook(() => usePlacedTop('press'))
    result.current.ref(p.el)
    const buttons = () => result.current.placedTop(box(334, 918), at) + p.size.anchor
    const before = buttons()
    // "Also open in" arrives above the buttons: the popover grows around them.
    p.size.height = 420
    p.size.anchor = 220
    expect(buttons()).toBe(before)
    // A scrollbar narrows the calendar for a frame, then goes.
    expect(result.current.placedTop(box(328, 918), at) + p.size.anchor).toBe(before)
    expect(result.current.placedTop(box(334, 918), at) + p.size.anchor).toBe(before)
  })
})

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
