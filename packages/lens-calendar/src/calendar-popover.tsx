import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Popover, PopoverContent, PopoverTitle } from '@pls/shared-ui'

/** A side UI SDK placed a popover on (its `data-side`). */
type Side = 'top' | 'bottom' | 'left' | 'right'

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

/** Where a popover's anchor is in it, its height and the side it was placed on. */
interface Measure {
  anchor: number | null
  height: number
  side: Side | null
}

/**
 * The anchor's distance below the top of the popover's content and the
 * content's height, in layout px. Its content, not its box: UI SDK caps the
 * box's height at the room on its side, which changes as it moves, so a box
 * read would move it again, and again. Nothing while it scales in or out:
 * read on screen then, a distance is short by the scale.
 */
function measure(content: HTMLElement): Measure | null {
  const { scale } = getComputedStyle(content)
  if (scale !== 'none' && scale !== '1') return null
  const anchor = content.querySelector<HTMLElement>('[data-popover-anchor]')
  return {
    anchor: anchor ? anchor.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop : null,
    height: content.scrollHeight,
    side: content.getAttribute('data-side') as Side | null,
  }
}

/**
 * Keeps a popover's anchor still as its content changes size after it is
 * shown (a lecture line that loads, "Also open in" arriving).
 *
 * `shift()` is the total shift down to add to UI SDK's placement (see
 * `anchorShift`), which UI SDK still keeps inside the window, so the anchor
 * only moves as far as that needs. It is read by the anchor UI SDK checks
 * every frame, so the first placement at the content's new size already has
 * it: worked out after UI SDK had placed it (a resize callback, a render),
 * the buttons would be drawn out of place for a frame or more.
 *
 * `side` is the side it was on when its content first changed size, asked
 * for from then on: a popover shifted for its new size and placed afresh
 * could otherwise be flipped to the other side of the press, moving every
 * button. (Asked for any sooner, a new side would place it afresh as it
 * scales in.)
 *
 * Both start again for each press placed (`pressKey`): a frame's change to
 * the calendar's box (a scrollbar) is no press, and never places it afresh.
 */
function useAnchorShift(pressKey: string) {
  const [placed, setPlaced] = useState<{ pressKey: string; side: Side } | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const heldRef = useRef<{ pressKey: string; last: Measure; shift: number } | null>(null)
  const ref = useCallback((content: HTMLElement | null) => {
    contentRef.current = content
    heldRef.current = null
  }, [])
  const shift = useCallback(() => {
    const content = contentRef.current
    const now = content && measure(content)
    const held = heldRef.current?.pressKey === pressKey ? heldRef.current : null
    if (!now) return held?.shift ?? 0
    if (!held) {
      heldRef.current = { pressKey, last: now, shift: 0 }
    } else {
      const { last } = held
      // The side it was on with the anchor where it was.
      const side = last.side ?? now.side
      if (last.anchor !== null && now.anchor !== null) {
        const by = anchorShift({
          anchorBefore: last.anchor,
          anchorAfter: now.anchor,
          heightBefore: last.height,
          heightAfter: now.height,
          // UI SDK holds its bottom still on the side above what was pressed.
          pinned: side === 'top' ? 'bottom' : 'top',
        })
        held.shift += by
        if (by !== 0 && side) setPlaced((p) => (p?.pressKey === pressKey ? p : { pressKey, side }))
      }
      held.last = now
    }
    return heldRef.current!.shift
  }, [pressKey])
  return { ref, shift, side: placed?.pressKey === pressKey ? placed.side : null }
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
  // As wide as it is drawn: no wider than the window less its margins.
  const shownWidth = Math.min(width, (typeof window === 'undefined' ? 1024 : window.innerWidth) - 2 * MARGIN)
  // The buttons stay where they are as content above them loads or goes.
  const { ref: anchorRef, shift, side } = useAnchorShift(`${x}:${y}:${top}:${bottom}:${left}:${right}`)
  // Read on every check, so it follows the calendar when the board moves.
  // Moved down by the shift (not offset from it): UI SDK keeps a popover
  // beside its anchor, so an offset alone would be pulled back to the press.
  // On whole pixels, as is `alignOffset`: UI SDK rounds the popover's place
  // to a pixel, and a place on a half pixel rounds either way on a hair of
  // difference (its scale just short of 1 as the scale-in ends), so the
  // popover would land a pixel off and step back a frame later.
  const anchor = useMemo(() => ({
    getBoundingClientRect: () => {
      const r = root.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
      const by = shift()
      const x = Math.round(r.left + left)
      return vertical
        ? DOMRect.fromRect({ x, y: Math.round(r.top + top + by), width: right - left, height: bottom - top })
        : DOMRect.fromRect({ x, y: Math.round(r.top + y + by), width: right - left, height: 0 })
    },
  }), [root, vertical, y, top, bottom, left, right, shift])
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
        side={side ?? (vertical ? 'top' : 'right')}
        // Centred on what was pressed by its known width, not the width UI SDK
        // reads: read as it scales in, that is a pixel off.
        align="start"
        sideOffset={GAP}
        // A little above the press, as before.
        alignOffset={vertical ? Math.round((right - left - shownWidth) / 2) : -24}
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
