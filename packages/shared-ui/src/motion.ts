import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

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
 * Rows of a list that change places (it re-sorts, or a row above comes or
 * goes) glide from where they were to where they are now, instead of
 * jumping: each child of `list` with a `data-glide-key` is followed, by its
 * place in the list's layout (so scrolling the list never counts). Checked
 * after every render, before the browser paints. Nothing moves under
 * reduced motion.
 */
export function useListGlide(list: RefObject<HTMLElement | null>): void {
  const tops = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const next = new Map<string, number>()
    const still = prefersReducedMotion()
    for (const row of el.children) {
      if (!(row instanceof HTMLElement) || !row.dataset.glideKey) continue
      const top = row.offsetTop
      next.set(row.dataset.glideKey, top)
      const was = tops.current.get(row.dataset.glideKey)
      if (still || was === undefined || Math.abs(was - top) < 1 || typeof row.animate !== 'function') continue
      row.animate([{ transform: `translateY(${was - top}px)` }, {}], { duration: MOTION_MS, easing: MOTION_EASE })
    }
    tops.current = next
  })
}
