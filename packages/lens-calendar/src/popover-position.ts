import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * Where a calendar popover of `width` goes: beside the point the student
 * clicked (`x`, `y`, relative to the calendar root), flipped to the left when
 * there is no room on the right, and kept inside `bounds`.
 */
export function usePopoverPosition(
  ref: RefObject<HTMLElement | null>,
  { x, y, bounds, width }: { x: number; y: number; bounds: { width: number; height: number }; width: number },
) {
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const place = () => {
      const height = ref.current?.offsetHeight ?? 320
      const left = x + 12 + width > bounds.width ? x - width - 12 : x + 12
      setPos({
        left: Math.max(8, Math.min(left, bounds.width - width - 8)),
        top: Math.max(8, Math.min(y - 24, bounds.height - height - 8)),
      })
    }
    place()
    // Content can grow after opening (e.g. a lecture line that loads): stay inside.
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(place)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, x, y, bounds.width, bounds.height, width])
  return pos
}

/** Presses that closed a popover, with the occurrence key of the block it was open on (null for a new block's). */
const closingPresses = new WeakMap<Event, string | null>()

/**
 * Marks a press as the one that closed a popover (open on block `key`, if
 * any). The press still reaches what is under it (a block starts its drag, a
 * button works); only what would start something new from it, like
 * drag-to-create on empty time, asks `closedPopover` and stands down.
 */
export function markClosingPress(e: Event, key: string | null) {
  closingPresses.set(e, key)
}

/** Whether this press closed a popover (so it shouldn't also start a new block). */
export function closedPopover(e: Event) {
  return closingPresses.has(e)
}

/** Whether this press closed the popover open on block `key` (a click on it then only closes it). */
export function closedPopoverOf(e: Event, key: string) {
  return closingPresses.get(e) === key
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
