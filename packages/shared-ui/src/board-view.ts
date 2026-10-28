/**
 * Bringing something on the board into view for the student (e.g. the block
 * a new review landed on), without fighting them: a scroll they make
 * themselves wins over one the app wants to make.
 */

/** Air kept between what is shown and the edge of the board's view. */
export const BOARD_VIEW_GAP = 16

/** Longest a browser's smooth scroll of the board takes. */
const GLIDE_MS = 1000

/** Keys that scroll whatever has focus, and which way (+1 down, -1 up). */
const SCROLL_KEYS: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1, Home: -1, End: 1, ' ': 1 }

const BOARD = '[data-canvas-scroll]'

let lastUserScroll = -Infinity
let watching = false
let touchY: number | null = null
/** The board's own smooth scroll in flight (`showOnBoard`), and when it is done by. */
let glide: { scroller: HTMLElement; until: number } | null = null

/**
 * The board, when input at `target` moving `dy` (down positive) scrolls it:
 * not when a scrolling list inside a widget (the transcript, the calendar
 * grid) can still move that way and so takes it, nor outside the board.
 */
function scrollsBoard(target: EventTarget | null, dy: number): HTMLElement | null {
  const start = target instanceof Element ? target : null
  const page = start === document.body || start === document.documentElement
  const board = page ? document.querySelector<HTMLElement>(BOARD) : start?.closest<HTMLElement>(BOARD) ?? null
  if (!board || page) return board
  for (let el: Element | null = start; el && el !== board; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue
    if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return null
    if (dy < 0 && el.scrollTop > 0) return null
  }
  return board
}

/**
 * The student is scrolling the board: note it, and stop any glide of ours.
 * A wheel the browser would drop while our glide runs is applied from where
 * the glide stopped (`wheelBy`, in pixels).
 */
function userScrolls(board: HTMLElement | null, wheelBy = 0) {
  if (!board) return
  lastUserScroll = performance.now()
  if (glide?.scroller === board && performance.now() < glide.until) {
    board.scrollTo({ top: board.scrollTop + wheelBy, behavior: 'instant' })
  }
  glide = null
}

/** A wheel's movement in pixels. */
function wheelPixels(e: WheelEvent, el: HTMLElement): number {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 40
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * el.clientHeight
  return e.deltaY
}

function onWheel(e: WheelEvent) {
  const board = scrollsBoard(e.target, e.deltaY)
  userScrolls(board, board ? wheelPixels(e, board) : 0)
}

function onTouchStart(e: TouchEvent) {
  touchY = e.touches[0]?.clientY ?? null
}

function onTouchMove(e: TouchEvent) {
  const y = e.touches[0]?.clientY
  if (y === undefined || touchY === null) return
  // A finger moving up scrolls the content down.
  const dy = touchY - y
  touchY = y
  if (dy !== 0) userScrolls(scrollsBoard(e.target, dy))
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  // Typing in a field moves its caret, not the board.
  if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return
  const dy = SCROLL_KEYS[e.key]
  if (dy) userScrolls(scrollsBoard(t, dy))
}

/**
 * Starts noting the student's own scrolling of the board (wheel, touch,
 * scroll keys) and returns now, to pass to `userScrolledSince` later. A
 * scroll a list inside a widget takes (the transcript, the calendar grid)
 * doesn't count; neither does dragging the scrollbar, which no event tells
 * apart from ours. Safe to call often.
 */
export function watchUserScroll(): number {
  if (!watching && typeof document !== 'undefined') {
    watching = true
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true })
    document.addEventListener('keydown', onKey, { capture: true })
  }
  return performance.now()
}

/** The student has scrolled the board since `since` (from `watchUserScroll`). */
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
  const smooth = opts.smooth !== false
  watchUserScroll()
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: clamped, behavior: smooth ? 'smooth' : 'auto' })
  else scroller.scrollTop = clamped
  // A scroll of the student's own while this glides stops it, so theirs takes.
  glide = smooth ? { scroller, until: performance.now() + GLIDE_MS } : null
  return true
}

/** The user asked for less motion: jump instead of gliding or flying. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
