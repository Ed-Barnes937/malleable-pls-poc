import { useMemo, type ReactNode, type RefObject } from 'react'
import { Popover, PopoverContent, PopoverTitle } from '@pls/shared-ui'

/** Gap between the press (or the block pressed) and the popover. */
const GAP = 12
/** Kept this far inside the window. */
const MARGIN = 8

/** The top and bottom of what was pressed (a block, or the new block a press on empty time makes). */
export interface Span {
  top: number
  bottom: number
}

/** Where the student pressed, relative to the calendar root, and the block pressed. */
export interface Press {
  x: number
  y: number
  span?: Span
}

/**
 * Whether a popover `width` wide fits beside a press at `clientX` (on its
 * right, or flipped to its left) inside the window. When it doesn't (a
 * phone), it goes above or below what was pressed instead, so that stays in
 * view.
 */
export function pressPlacement({ clientX, width, viewportWidth }: { clientX: number; width: number; viewportWidth: number }): 'beside' | 'vertical' {
  const right = clientX + GAP + width <= viewportWidth - MARGIN
  const left = clientX - GAP - width >= MARGIN
  return right || left ? 'beside' : 'vertical'
}

export interface CalendarPopoverProps {
  open: boolean
  /** The calendar root `press` is relative to. */
  root: RefObject<HTMLElement | null>
  press: Press
  width: number
  /** The dialog's accessible name. */
  label: string
  /** `data-variant`, e.g. "study-block". */
  variant?: string
  /** Opened by a touch press: focus goes to the card, so no on-screen keyboard rises over what was tapped. */
  touch?: boolean
  /** Where focus goes when it closes while focus is inside it (what opened it). */
  finalFocus: () => HTMLElement | null
  /** Escape. Every other close is the calendar's (`closing-press.ts`). */
  onClose: () => void
  /** It has finished closing (after its exit animation). */
  onClosed: () => void
  children: ReactNode
}

/** Focuses the card itself (a callback ref: it runs as the card mounts). */
function focusCard(card: HTMLElement | null) {
  card?.focus({ preventScroll: true })
}

/**
 * A calendar popover on UI SDK Popover, anchored to the press: beside the
 * point pressed when it fits in the window, else above (or below) the block
 * pressed. UI SDK handles Escape and focus return; presses and focus leaving
 * never close it here: CalendarLens's capture `pointerdown` does that, so a
 * press can close it and still reach what is under it (see closing-press.ts).
 */
export function CalendarPopover({ open, root, press, width, label, variant, touch, finalFocus, onClose, onClosed, children }: CalendarPopoverProps) {
  const { x, y } = press
  const top = press.span?.top ?? y
  const bottom = press.span?.bottom ?? y
  const rootLeft = root.current?.getBoundingClientRect().left ?? 0
  const placement = pressPlacement({ clientX: rootLeft + x, width, viewportWidth: typeof window === 'undefined' ? 1024 : window.innerWidth })
  const vertical = placement === 'vertical'
  // Read on every check, so it follows the calendar when the board moves.
  const anchor = useMemo(() => ({
    getBoundingClientRect: () => {
      const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
      return vertical
        ? DOMRect.fromRect({ x: r.left + x, y: r.top + top, width: 0, height: bottom - top })
        : DOMRect.fromRect({ x: r.left + x, y: r.top + y, width: 0, height: 0 })
    },
  }), [root, vertical, x, y, top, bottom])

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) return
        if (details.reason === 'outside-press' || details.reason === 'focus-out' || details.reason === 'window-blur') {
          details.cancel()
          return
        }
        onClose()
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed()
      }}
    >
      <PopoverContent
        anchor={anchor}
        side={vertical ? 'top' : 'right'}
        align={vertical ? 'center' : 'start'}
        sideOffset={GAP}
        // A little above the press, as before.
        alignOffset={vertical ? 0 : -24}
        collisionPadding={MARGIN}
        // Mounted open, UI SDK moves no focus. The body focuses its own first
        // control (autoFocus); opened by touch, the card takes it (below).
        initialFocus="none"
        ref={touch ? focusCard : undefined}
        finalFocus={finalFocus}
        data-testid="calendar-popover"
        data-variant={variant}
        // A press in here doesn't close it (CalendarLens).
        data-calendar-popover=""
        // Nor does it reach the board or the grid behind.
        onPointerDown={(e) => e.stopPropagation()}
        className="block max-w-[calc(100vw-16px)] gap-0 p-0"
        style={{ width }}
      >
        {/* Names the dialog (it has no trigger to be named by). */}
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        {children}
      </PopoverContent>
    </Popover>
  )
}
