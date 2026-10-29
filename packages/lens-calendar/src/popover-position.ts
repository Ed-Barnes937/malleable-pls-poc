import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const GAP = 12
const MARGIN = 8

/** The top and bottom of what was pressed (a block, or the new block a press on empty time makes). */
export interface Span {
  top: number
  bottom: number
}

/**
 * Where a calendar popover of `width` x `height` goes: beside the point the
 * student pressed (`x`, `y`, relative to the calendar root), flipped to the
 * left when there is no room on the right, and kept inside `bounds`. When it
 * can't sit beside the point (a phone, or a narrow panel, where it is nearly
 * as wide as the calendar), it goes above what was pressed (`span`, the point
 * when absent), or below it, so that stays in view; only when neither fits
 * does it cover it.
 */
export function placePopover(
  { x, y, span = { top: y, bottom: y }, bounds, width, height }:
  { x: number; y: number; span?: Span; bounds: { width: number; height: number }; width: number; height: number },
) {
  const beside = x + GAP + width > bounds.width ? x - width - GAP : x + GAP
  const left = Math.max(MARGIN, Math.min(beside, bounds.width - width - MARGIN))
  const covers = left <= x && x <= left + width
  const above = span.top - GAP - height
  const below = span.bottom + GAP
  const top = !covers
    ? y - 24
    : above >= MARGIN
      ? above
      : below + height <= bounds.height - MARGIN
        ? below
        : y - 24
  return { left, top: Math.max(MARGIN, Math.min(top, bounds.height - height - MARGIN)) }
}

/** `placePopover` for a popover element, kept in place as its content grows. */
export function usePopoverPosition(
  ref: RefObject<HTMLElement | null>,
  { x, y, span, bounds, width }: { x: number; y: number; span?: Span; bounds: { width: number; height: number }; width: number },
) {
  const [pos, setPos] = useState({ left: x, top: y })
  const spanTop = span?.top
  const spanBottom = span?.bottom
  useLayoutEffect(() => {
    const pressed = spanTop === undefined || spanBottom === undefined ? undefined : { top: spanTop, bottom: spanBottom }
    const place = () => setPos(placePopover({ x, y, span: pressed, bounds, width, height: ref.current?.offsetHeight ?? 320 }))
    place()
    // Content can grow after opening (e.g. a lecture line that loads): stay inside.
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(place)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, x, y, spanTop, spanBottom, bounds.width, bounds.height, width])
  return pos
}

/**
 * Calls `onClose` on Escape. One listener for the popover's lifetime:
 * re-subscribing on every render (onClose is often a fresh function) could
 * drop an Escape mid-dispatch when the shell's own Escape handling
 * re-renders the board.
 */
export function useEscapeToClose(onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
