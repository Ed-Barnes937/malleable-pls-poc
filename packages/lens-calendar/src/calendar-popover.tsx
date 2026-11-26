import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Popover, PopoverContent, PopoverTitle } from '@pls/shared-ui'

/** Gap between the press (or the block pressed) and the popover. */
const GAP = 12
/** Kept this far inside the window. */
const MARGIN = 8

/**
 * The top and bottom of what was pressed (a block, or the new block a press
 * on empty time makes). With its sides too when it is placed again from the
 * block alone (no press to sit beside, e.g. after the phone turns).
 */
export interface Span {
  top: number
  bottom: number
  left?: number
  right?: number
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
 * view. Given the block's sides (`from`, in client coordinates), it must fit
 * beside the whole block rather than beside the point.
 */
export function pressPlacement({ clientX, width, viewportWidth, from }: {
  clientX: number
  width: number
  viewportWidth: number
  from?: { left: number; right: number }
}): 'beside' | 'vertical' {
  const right = (from?.right ?? clientX) + GAP + width <= viewportWidth - MARGIN
  const left = (from?.left ?? clientX) - GAP - width >= MARGIN
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

/**
 * How far down (px) a popover's top must move, beyond where UI SDK would put
 * it, to keep its anchor (the element marked `data-popover-anchor`, the
 * buttons the student is reaching for) where it was on screen as its content
 * changes size: content above the anchor growing or going grows or shrinks
 * the popover around it. `anchorBefore` / `anchorAfter` are the anchor's
 * distance below the popover's top; `pinned` is the edge UI SDK holds still
 * (the bottom when the popover sits above what was pressed).
 */
export function anchorShift(
  { anchorBefore, anchorAfter, heightBefore, heightAfter, pinned }:
  { anchorBefore: number; anchorAfter: number; heightBefore: number; heightAfter: number; pinned: 'top' | 'bottom' },
): number {
  const ownMove = pinned === 'bottom' ? heightBefore - heightAfter : 0
  return anchorBefore - anchorAfter - ownMove
}

/**
 * Keeps a popover's anchor still as its content changes size after it is
 * shown (a lecture line that loads, "Also open in" arriving): the total shift
 * down to add to UI SDK's placement (see `anchorShift`), which UI SDK still
 * keeps inside the window, so the anchor only moves as far as that needs.
 * Starts again for each press placed (`pressKey`): a frame's change to the
 * calendar's box (a scrollbar) is no press, and never places it afresh.
 * Returns the ref for the popover's content and the shift.
 */
function useAnchorShift(pressKey: string) {
  const [moved, setMoved] = useState({ pressKey, shift: 0 })
  const contentRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const pressKeyRef = useRef(pressKey)
  pressKeyRef.current = pressKey
  const ref = useCallback((content: HTMLElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    contentRef.current = content
    if (!content || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const anchor = content.querySelector<HTMLElement>('[data-popover-anchor]')
      return {
        anchor: anchor ? anchor.getBoundingClientRect().top - content.getBoundingClientRect().top : null,
        height: content.offsetHeight,
      }
    }
    let last = measure()
    const observer = new ResizeObserver(() => {
      const now = measure()
      if (last.anchor !== null && now.anchor !== null) {
        const by = anchorShift({
          anchorBefore: last.anchor,
          anchorAfter: now.anchor,
          heightBefore: last.height,
          heightAfter: now.height,
          pinned: content.getAttribute('data-side') === 'top' ? 'bottom' : 'top',
        })
        const key = pressKeyRef.current
        if (by !== 0) setMoved((m) => ({ pressKey: key, shift: (m.pressKey === key ? m.shift : 0) + by }))
      }
      last = now
    })
    observer.observe(content)
    observerRef.current = observer
  }, [])
  return { ref, contentRef, shift: moved.pressKey === pressKey ? moved.shift : 0 }
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
  // Given the block's sides, beside (or above / below) the whole block, never over it.
  const left = press.span?.left ?? x
  const right = press.span?.right ?? x
  const rootLeft = root.current?.getBoundingClientRect().left ?? 0
  const placement = pressPlacement({
    clientX: rootLeft + x,
    width,
    viewportWidth: typeof window === 'undefined' ? 1024 : window.innerWidth,
    from: press.span?.left !== undefined && press.span.right !== undefined ? { left: rootLeft + left, right: rootLeft + right } : undefined,
  })
  const vertical = placement === 'vertical'
  // Read on every check, so it follows the calendar when the board moves.
  const anchor = useMemo(() => ({
    getBoundingClientRect: () => {
      const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
      return vertical
        ? DOMRect.fromRect({ x: r.left + left, y: r.top + top, width: right - left, height: bottom - top })
        : DOMRect.fromRect({ x: r.left + left, y: r.top + y, width: right - left, height: 0 })
    },
  }), [root, vertical, y, top, bottom, left, right])
  // The buttons stay where they are as content above them loads or goes.
  const { ref: anchorRef, contentRef: shown, shift } = useAnchorShift(`${x}:${y}:${top}:${bottom}:${left}:${right}`)
  // Read as it renders: a shift re-renders it, and the side is UI SDK's by then.
  const above = shift !== 0 && shown.current?.getAttribute('data-side') === 'top'
  const contentRef = useCallback((el: HTMLElement | null) => {
    anchorRef(el)
    if (touch) focusCard(el)
  }, [anchorRef, touch])

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
        // Above what was pressed, a shift down is a smaller gap; below it, a bigger one.
        sideOffset={vertical ? (above ? GAP - shift : GAP + shift) : GAP}
        // A little above the press, as before.
        alignOffset={vertical ? 0 : -24 + shift}
        collisionPadding={MARGIN}
        // Mounted open, UI SDK moves no focus. The body focuses its own first
        // control (autoFocus); opened by touch, the card takes it (below).
        initialFocus="none"
        ref={contentRef}
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
