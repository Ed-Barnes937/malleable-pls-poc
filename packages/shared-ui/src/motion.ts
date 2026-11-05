import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

/**
 * The app's one motion language (flow audit decision 19): things arrive and
 * leave with a short scale-and-slide from where they are, and nothing moves
 * at all for a student who asked for less motion. The CSS side is
 * `motion-safe:animate-enter` (apps/web/src/index.css); this is the same
 * motion for code that animates from script (motion/react, element.animate).
 */

/** How long an arrival, a departure or a board switch takes. */
export const MOTION_MS = 200

/** Quick start, soft landing. The same curve as `--ease-motion` in CSS. */
export const MOTION_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

/** `MOTION_EASE` for motion/react, which takes the four numbers. */
export const MOTION_EASE_BEZIER: [number, number, number, number] = [0.2, 0.8, 0.2, 1]

/**
 * Where an arrival starts (and a departure ends): a little smaller, a little
 * lower, and see-through. It ends on the element's own look, so an arrival
 * never undoes a dimmed or faded state.
 */
export const ENTER_FROM = { opacity: 0, y: 6, scale: 0.94 } as const

/** How far a board slides in when the student switches to it. */
export const BOARD_SLIDE_PX = 28

/**
 * A board coming in from the side its tab is on: from the right for a tab to
 * the right of the one left, from the left for one to its left. For
 * `element.animate`; it ends on the board's own look.
 */
export function boardSlideKeyframes(from: 'left' | 'right'): Keyframe[] {
  const x = from === 'right' ? BOARD_SLIDE_PX : -BOARD_SLIDE_PX
  return [{ opacity: 0, transform: `translateX(${x}px)` }, {}]
}

/**
 * What fills a place changing over to something else (e.g. Help me plan
 * becoming a draft): the new content slides up into view. It starts hidden,
 * so the change is never seen as a jump. For `element.animate`.
 */
export const SWAP_KEYFRAMES: Keyframe[] = [{ opacity: 0, transform: `translateY(${ENTER_FROM.y}px)` }, {}]

/** `element.animate` options for the shared motion. `backwards`, never `both`: a finished motion must not pin its end values. */
export const MOTION_TIMING: KeyframeAnimationOptions = { duration: MOTION_MS, easing: MOTION_EASE, fill: 'backwards' }

const REDUCE = '(prefers-reduced-motion: reduce)'

/** The student asked for less motion: jump instead of gliding or flying. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(REDUCE).matches === true
}

function subscribe(onChange: () => void): () => void {
  const query = typeof window !== 'undefined' ? window.matchMedia?.(REDUCE) : undefined
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** `prefersReducedMotion`, kept current if the setting changes while the app is open. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}

/**
 * Rows of a list that change places (it re-sorts, or a row comes or goes)
 * glide from where they were to where they are now, instead of jumping:
 * each child of `list` with a `data-glide-key` is followed by its place in
 * the list's layout (so scrolling the list never counts). Places are read
 * only when `keys` (the rows, in order) change, before the browser paints,
 * and again whenever the list resizes, so a row that grew meanwhile is never
 * taken for a move. The glide adds to whatever else moves the row (e.g. its
 * own arrival), never replacing it. Nothing moves under reduced motion.
 * `axis: 'x'` for a row of items, e.g. the board tabs.
 */
export function useListGlide(list: RefObject<HTMLElement | null>, keys: ReadonlyArray<string>, axis: 'x' | 'y' = 'y'): void {
  const places = useRef(new Map<string, number>())
  const order = keys.join('\n')
  const measure = useCallback((el: HTMLElement, glide: boolean) => {
    const next = new Map<string, number>()
    const still = !glide || prefersReducedMotion()
    for (const row of el.children) {
      if (!(row instanceof HTMLElement) || !row.dataset.glideKey) continue
      const place = axis === 'x' ? row.offsetLeft : row.offsetTop
      next.set(row.dataset.glideKey, place)
      const was = places.current.get(row.dataset.glideKey)
      if (still || was === undefined || Math.abs(was - place) < 1 || typeof row.animate !== 'function') continue
      const at = (px: number) => (axis === 'x' ? `translateX(${px}px)` : `translateY(${px}px)`)
      row.animate([{ transform: at(was - place) }, { transform: at(0) }], { duration: MOTION_MS, easing: MOTION_EASE, composite: 'add' })
    }
    places.current = next
  }, [axis])
  // Re-read without gliding as the list or any row resizes (a row that grew
  // moved the ones under it, and that is not a move to glide later).
  const observer = useRef<ResizeObserver | null>(null)
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    measure(el, true)
    if (typeof ResizeObserver === 'undefined') return
    observer.current ??= new ResizeObserver(() => { if (list.current) measure(list.current, false) })
    observer.current.disconnect()
    observer.current.observe(el)
    for (const row of el.children) if (row instanceof HTMLElement && row.dataset.glideKey) observer.current.observe(row)
  }, [list, order, measure])
  useEffect(() => () => observer.current?.disconnect(), [])
}

/**
 * An element whose width the layout around it decides (e.g. a button that
 * shares a row with pills that come and go, and truncates to the room its
 * parent is given) glides from its old width to its new one instead of
 * jumping. Its parent's room changes at once; only the element catches up,
 * so what is next to it never moves meanwhile. The room changing again
 * mid-glide sends it on from where it is. Nothing moves under reduced
 * motion. Pass `enabled: false` to leave it be.
 */
export function useWidthGlide(target: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    const el = target.current
    const parent = el?.parentElement
    if (!enabled || !el || !parent || typeof ResizeObserver === 'undefined' || typeof el.animate !== 'function') return
    const roomOf = () => parent.getBoundingClientRect().width
    let width = el.getBoundingClientRect().width
    let glide: { animation: Animation; room: number } | null = null
    const observer = new ResizeObserver(() => {
      const room = roomOf()
      // Its own frames while it glides; the width it lands on is read when it lands.
      if (glide && Math.abs(glide.room - room) < 1) return
      let from = width
      if (glide) {
        from = el.getBoundingClientRect().width
        glide.animation.cancel()
        glide = null
      }
      width = el.getBoundingClientRect().width
      if (Math.abs(width - from) < 1 || prefersReducedMotion()) return
      // Not shrunk to its new room meanwhile (as a flex item would be): it glides there.
      const animation = el.animate(
        [{ width: `${from}px`, flexShrink: 0 }, { width: `${width}px`, flexShrink: 0 }],
        { duration: MOTION_MS, easing: MOTION_EASE },
      )
      const gliding = { animation, room }
      glide = gliding
      const landed = () => { if (glide === gliding) glide = null }
      animation.finished.then(landed, landed)
    })
    observer.observe(el)
    observer.observe(parent)
    return () => {
      observer.disconnect()
      glide?.animation.cancel()
    }
  }, [target, enabled])
}
