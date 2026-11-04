// PROTOTYPE (flow audit p4b, "week peek"). Throwaway: lives on the
// proto/p4-week-peek branch only and is never merged. What the top bar's
// "Xh to study" opens, switched by `?p4=a|b|c`:
//   a - an anchored popover with a compact week strip.
//   b - a right-hand slide-over sheet with the real Calendar in week view.
//   c - a "Today and next" agenda list.
import { useEffect, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react'

export type P4Variant = 'a' | 'b' | 'c'
const VARIANTS: P4Variant[] = ['a', 'b', 'c']
const NAMES: Record<P4Variant, string> = {
  a: 'Popover week strip',
  b: 'Calendar sheet',
  c: 'Today and next',
}

function readVariant(): P4Variant {
  const v = new URLSearchParams(window.location.search).get('p4')
  return VARIANTS.includes(v as P4Variant) ? (v as P4Variant) : 'a'
}

// One tiny store for the prototype: the variant, whether the peek is open
// (and what opened it, to anchor to) and a pending "open Help me plan".
interface P4State {
  variant: P4Variant
  open: boolean
  anchor: DOMRect | null
  /** Bumped by "Plan my week"; a Calendar that sees a new value opens Help me plan. */
  planRequest: number
}
let state: P4State = { variant: readVariant(), open: false, anchor: null, planRequest: 0 }
const listeners = new Set<() => void>()
function set(patch: Partial<P4State>) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}
function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** PROTOTYPE: the p4 store. */
export function useP4(): P4State {
  return useSyncExternalStore(subscribe, () => state)
}
export function toggleP4Peek(anchor: HTMLElement | null) {
  set({ open: !state.open, anchor: anchor?.getBoundingClientRect() ?? null })
}
export function closeP4Peek() {
  set({ open: false })
}
/** Ask the (next) Calendar to open Help me plan in week view. */
export function requestP4Plan() {
  set({ open: false, planRequest: state.planRequest + 1 })
}
/** The last plan request a Calendar acted on, so each is handled once. */
let handledPlanRequest = 0
export function takeP4PlanRequest(): boolean {
  if (state.planRequest === handledPlanRequest) return false
  handledPlanRequest = state.planRequest
  return true
}

function setVariant(v: P4Variant) {
  const url = new URL(window.location.href)
  url.searchParams.set('p4', v)
  window.history.replaceState(window.history.state, '', url)
  set({ variant: v })
}

/**
 * PROTOTYPE: the p4 switcher, top-centre under the top bar (the spot p4
 * owns, so the four flow-audit prototypes can share one branch). Mount it
 * inside a positioned container that starts under the top bar.
 */
export function P4Switcher() {
  const { variant } = useP4()
  const i = VARIANTS.indexOf(variant)
  const go = (step: number) => setVariant(VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey) return
      if (e.code === 'BracketLeft') go(-1)
      if (e.code === 'BracketRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      data-testid="p4-switcher"
      className="absolute left-1/2 top-2 z-[10005] flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-neutral-900 px-1.5 py-1 text-[12px] font-semibold text-white shadow-lg ring-2 ring-sky-400"
    >
      <button type="button" aria-label="Previous p4 variant" onClick={() => go(-1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15">
        <ChevronLeft size={16} />
      </button>
      <span className="flex items-center gap-1.5 px-1">
        <FlaskConical size={13} className="text-sky-300" />
        p4 week peek: {variant.toUpperCase()} ({NAMES[variant]})
      </span>
      <button type="button" aria-label="Next p4 variant" onClick={() => go(1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
