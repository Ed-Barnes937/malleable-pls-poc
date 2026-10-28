/**
 * Bringing something on the board into view for the student (e.g. the block
 * a new review landed on), without fighting them: a scroll they make
 * themselves wins over one the app wants to make.
 */

/** Air kept between what is shown and the edge of the board's view. */
export const BOARD_VIEW_GAP = 16

/** Keys that scroll whatever has focus. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

let lastUserScroll = -Infinity
let watching = false

function markUserScroll() {
  lastUserScroll = performance.now()
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  // Typing in a field moves its caret, not the board.
  if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return
  if (SCROLL_KEYS.has(e.key)) markUserScroll()
}

/**
 * Starts noting the student's own scrolling (wheel, touch, scroll keys) and
 * returns now, to pass to `userScrolledSince` later. Safe to call often.
 */
export function watchUserScroll(): number {
  if (!watching && typeof document !== 'undefined') {
    watching = true
    document.addEventListener('wheel', markUserScroll, { capture: true, passive: true })
    document.addEventListener('touchmove', markUserScroll, { capture: true, passive: true })
    document.addEventListener('keydown', onKey, { capture: true })
  }
  return performance.now()
}

/** The student has scrolled since `since` (from `watchUserScroll`). */
export function userScrolledSince(since: number): boolean {
  return lastUserScroll >= since
}

/** A vertical extent in viewport pixels, e.g. from `getBoundingClientRect()`. */
export interface Span {
  top: number
  bottom: number
}

/**
 * The board scroll position that shows `target` with `gap` of air, moving as
 * little as possible, along with as many of `keep` as fit in the view with
 * it, in order (e.g. the moment it came from, then the day it is on). Null
 * when that is all in view already. `view` is the board's visible extent
 * and `scrollTop` its current scroll, all in the same pixels.
 */
export function boardScrollFor(
  view: Span,
  scrollTop: number,
  target: Span,
  keep: ReadonlyArray<Span | null | undefined> = [],
  gap = BOARD_VIEW_GAP,
): number | null {
  const room = view.bottom - view.top - 2 * gap
  let want = target
  for (const k of keep) {
    if (!k) continue
    const both = { top: Math.min(want.top, k.top), bottom: Math.max(want.bottom, k.bottom) }
    if (both.bottom - both.top <= room) want = both
  }
  const above = view.top + gap - want.top
  const below = want.bottom - (view.bottom - gap)
  if (above <= 0 && below <= 0) return null
  // Taller than the view: show it from its top.
  if (above > 0 || want.bottom - want.top > room) return scrollTop - above
  return scrollTop + below
}

/**
 * Scrolls the board around `inside` so `target` (viewport pixels, where it
 * will be once any scroll inside a widget is done) is in view, with as much
 * of `keep` as fits (see `boardScrollFor`). Does nothing when the student
 * has scrolled since `since`. Returns whether it scrolled.
 */
export function showOnBoard(
  inside: Element,
  target: Span,
  opts: { keep?: ReadonlyArray<Span | null | undefined>; since?: number; smooth?: boolean } = {},
): boolean {
  const scroller = inside.closest<HTMLElement>('[data-canvas-scroll]')
  if (!scroller) return false
  if (opts.since !== undefined && userScrolledSince(opts.since)) return false
  const rect = scroller.getBoundingClientRect()
  const top = boardScrollFor({ top: rect.top, bottom: rect.top + scroller.clientHeight }, scroller.scrollTop, target, opts.keep)
  if (top === null) return false
  const clamped = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight))
  if (clamped === scroller.scrollTop) return false
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: clamped, behavior: opts.smooth === false ? 'auto' : 'smooth' })
  else scroller.scrollTop = clamped
  return true
}

/** The user asked for less motion: jump instead of gliding or flying. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
