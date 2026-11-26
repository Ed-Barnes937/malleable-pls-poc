import { useCallback, useMemo, useRef, type ReactNode, type RefObject } from 'react'
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
 * The window a popover is kept inside, seen from the calendar: the calendar's
 * top (client px, negative once scrolled partly off) and the window's height.
 * Only the window bounds it: it may spill past the calendar (K3 decision 7).
 */
export interface InWindow {
  calendarTop: number
  viewportHeight: number
}

function keptInside(top: number, height: number, { calendarTop, viewportHeight }: InWindow) {
  return Math.max(MARGIN - calendarTop, Math.min(top, viewportHeight - calendarTop - height - MARGIN))
}

/**
 * Where a popover `height` tall opens (its top, px below the calendar's top):
 * beside the point pressed (`y`), a little above it; or, where it can't sit
 * beside it (a phone), above what was pressed (`span`, the point when absent)
 * when it fits there, else below it when it fits there, so that stays in
 * view; only when neither fits does it cover it. Kept inside the window.
 */
export function popoverTop(
  { placement, y, span = { top: y, bottom: y }, height, ...inWindow }:
  { placement: 'beside' | 'vertical'; y: number; span?: Span; height: number } & InWindow,
): number {
  const { calendarTop, viewportHeight } = inWindow
  const above = span.top - GAP - height
  const below = span.bottom + GAP
  const top = placement === 'beside'
    ? y - 24
    : above >= MARGIN - calendarTop
      ? above
      : below + height <= viewportHeight - calendarTop - MARGIN
        ? below
        : y - 24
  return keptInside(top, height, inWindow)
}

/**
 * Where a popover's top goes when its content changes size after it opened:
 * the one that keeps its anchor (the buttons the student is reaching for)
 * where it was on screen, even over what was pressed. `anchorBefore` and
 * `anchorAfter` are the anchor's distance below the popover's top. Only when
 * keeping it still would take the popover out of the window does the anchor move.
 */
export function anchoredTop(
  { top, anchorBefore, anchorAfter, height, ...inWindow }:
  { top: number; anchorBefore: number; anchorAfter: number; height: number } & InWindow,
): number {
  return keptInside(top + anchorBefore - anchorAfter, height, inWindow)
}

/**
 * The popover's full height and its anchor's (the element marked
 * `data-popover-anchor`) distance below its top, in layout px: unchanged by
 * its scale-in, and by UI SDK capping its box at `--available-height` (which
 * changes as it moves, so a box read would move it again, and again).
 */
function measure(content: HTMLElement): { anchor: number | null; height: number } {
  let anchor: number | null = null
  let el = content.querySelector<HTMLElement>('[data-popover-anchor]')
  if (el) {
    let offset = 0
    while (el && el !== content) {
      offset += el.offsetTop
      el = el.offsetParent as HTMLElement | null
    }
    // Measured from the popover's border edge, as its top is.
    if (el === content) anchor = offset + content.clientTop
  }
  return { anchor, height: content.scrollHeight + content.offsetHeight - content.clientHeight }
}

/**
 * Where a popover's top is, px below the calendar's top (main's rule): placed
 * once by its height when first measured (`popoverTop`), and from then on
 * only grown or shrunk around its anchor, which stays where it is on screen
 * as content loads or goes (`anchoredTop`): a lecture line that loads, "Also
 * open in" arriving. Without an anchor it is placed afresh at each size. Kept
 * inside the window, spilling past the calendar where it must. Read by the anchor UI SDK checks
 * every frame, so the first placement at the content's new size already has
 * it: worked out after UI SDK had placed it (a resize callback, a render),
 * the buttons would be drawn out of place for a frame or more.
 *
 * Where it was placed lasts as long as the press it answers (`pressKey`): a
 * frame's change to the calendar's box (a scrollbar) is no press, and never
 * places it afresh.
 */
function usePlacedTop(pressKey: string) {
  const contentRef = useRef<HTMLElement | null>(null)
  const placedRef = useRef<{ pressKey: string; top: number; anchor: number | null } | null>(null)
  const ref = useCallback((content: HTMLElement | null) => {
    contentRef.current = content
  }, [])
  const placedTop = useCallback((root: DOMRect, at: Omit<Parameters<typeof popoverTop>[0], 'height' | keyof InWindow>) => {
    const content = contentRef.current
    let placed = placedRef.current?.pressKey === pressKey ? placedRef.current : null
    // Not laid out yet: placed once it has a height to place.
    if (!content?.offsetHeight) return placed?.top ?? at.y - 24
    const { anchor, height } = measure(content)
    const inWindow = { calendarTop: root.top, viewportHeight: window.visualViewport?.height ?? window.innerHeight }
    const top = placed && placed.anchor !== null && anchor !== null
      ? anchoredTop({ top: placed.top, anchorBefore: placed.anchor, anchorAfter: anchor, height, ...inWindow })
      : popoverTop({ ...at, height, ...inWindow })
    placed = placedRef.current = { pressKey, top, anchor }
    return placed.top
  }, [pressKey])
  return { ref, placedTop }
}

/** Focuses the card itself (a callback ref: it runs as the card mounts). */
function focusCard(card: HTMLElement | null) {
  card?.focus({ preventScroll: true })
}

/**
 * A calendar popover on UI SDK Popover, anchored to the press: beside the
 * point pressed when it fits in the window, else above the block pressed when
 * it fits there, or below it (`popoverTop`), kept inside the window (it may
 * spill past the calendar). UI SDK handles Escape and focus return; presses and focus leaving
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
  // Where it opens, and its buttons staying where they are as content loads or goes.
  const { ref: placedRef, placedTop } = usePlacedTop(`${x}:${y}:${top}:${bottom}:${left}:${right}`)
  // Read on every check, so it follows the calendar when the board moves.
  // The anchor is a line along the popover's top edge: beside what was
  // pressed, or (vertical) at its left edge, centred on what was pressed.
  // Offsets are in it, not in UI SDK's `sideOffset` / `alignOffset`: those
  // are scaled with the popover as it scales in, and a popover placed a
  // fraction off lands a pixel off and steps back a frame later. On whole
  // pixels, as UI SDK rounds a place to a pixel either way on a hair of
  // difference.
  const anchor = useMemo(() => ({
    getBoundingClientRect: () => {
      const r = root.current?.getBoundingClientRect() ?? DOMRect.fromRect()
      const at = Math.round(r.top + placedTop(r, { placement, y, span: { top, bottom } }))
      return vertical
        ? DOMRect.fromRect({ x: Math.round(r.left + left + (right - left - shownWidth) / 2), y: at, width: shownWidth, height: 0 })
        : DOMRect.fromRect({ x: Math.round(r.left + left), y: at, width: right - left, height: 0 })
    },
  }), [root, placement, vertical, y, top, bottom, left, right, shownWidth, placedTop])
  const contentRef = useCallback((el: HTMLElement | null) => {
    placedRef(el)
    if (touch) focusCard(el)
  }, [placedRef, touch])

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
        // Below the line along its top (see anchor); beside a press, on its
        // right, flipped to its left where there is no room.
        side={vertical ? 'bottom' : 'right'}
        align="start"
        sideOffset={vertical ? 0 : GAP}
        alignOffset={0}
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
