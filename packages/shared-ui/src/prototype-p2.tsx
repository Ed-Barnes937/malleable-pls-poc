// PROTOTYPE (flow audit p2, "sorted moments"). Throwaway: lives on the
// proto/p2-sorted branch only and is never merged. Three variants of where a
// student marks a confusing moment as sorted, switched by `?p2=a|b|c`:
//   a - the Transcript tag bar toggles, plus a "Sorted" toggle there.
//   b - Test Me's "Got it" on a confused moment asks "Mark sorted?"; the
//       Transcript only shows the state.
//   c - both, plus the "N moments to review" chips start a focused Test Me run.
import { useEffect, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react'

export type P2Variant = 'a' | 'b' | 'c'
const VARIANTS: P2Variant[] = ['a', 'b', 'c']
const NAMES: Record<P2Variant, string> = {
  a: 'Transcript toggles',
  b: 'Test Me asks',
  c: 'Both + focused review',
}

function readVariant(): P2Variant {
  const v = new URLSearchParams(window.location.search).get('p2')
  return VARIANTS.includes(v as P2Variant) ? (v as P2Variant) : 'a'
}

const listeners = new Set<() => void>()
function subscribe(fn: () => void) {
  listeners.add(fn)
  window.addEventListener('popstate', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('popstate', fn)
  }
}

/** PROTOTYPE: the p2 variant in the URL. */
export function useP2Variant(): P2Variant {
  return useSyncExternalStore(subscribe, readVariant)
}

function setVariant(v: P2Variant) {
  const url = new URL(window.location.href)
  url.searchParams.set('p2', v)
  window.history.replaceState(window.history.state, '', url)
  for (const fn of listeners) fn()
}

// --- Variant C: a focused Test Me run started from a "to review" chip ------

export interface P2RunItem {
  segmentId: string
  label: string
  recordingId: string
  recordingTitle: string
  offsetMs: number
}
export interface P2FocusRun {
  /** The moments to review the run covers, fixed when it starts. */
  items: P2RunItem[]
  /** Bumped per start, so Test Me restarts at question 1. */
  startedAt: number
}
let focusRun: P2FocusRun | null = null
const runListeners = new Set<() => void>()
function emitRun() {
  for (const fn of runListeners) fn()
}

/** PROTOTYPE: the focused review in progress (variant C), if any. */
export function useP2FocusRun(): P2FocusRun | null {
  return useSyncExternalStore(
    (fn) => {
      runListeners.add(fn)
      return () => runListeners.delete(fn)
    },
    () => focusRun,
  )
}
export function startP2FocusRun(items: P2RunItem[]) {
  focusRun = { items, startedAt: Date.now() }
  emitRun()
}
export function endP2FocusRun() {
  focusRun = null
  emitRun()
}

/**
 * PROTOTYPE: the p2 switcher, bottom-left (the corner p2 owns, so the four
 * flow-audit prototypes can share one branch). Arrows or the keyboard's
 * Alt+[ and Alt+] cycle the variants.
 */
export function P2Switcher() {
  const variant = useP2Variant()
  const i = VARIANTS.indexOf(variant)
  const go = (step: number) => setVariant(VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      if (e.code === 'BracketLeft') go(-1)
      if (e.code === 'BracketRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      data-testid="p2-switcher"
      className="fixed bottom-3 left-3 z-[10050] flex items-center gap-1 rounded-full bg-neutral-900 px-1.5 py-1 text-[12px] font-semibold text-white shadow-lg ring-2 ring-fuchsia-400"
    >
      <button type="button" aria-label="Previous p2 variant" onClick={() => go(-1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15">
        <ChevronLeft size={16} />
      </button>
      <span className="flex items-center gap-1.5 px-1">
        <FlaskConical size={13} className="text-fuchsia-300" />
        p2 sorted: {variant.toUpperCase()} ({NAMES[variant]})
      </span>
      <button type="button" aria-label="Next p2 variant" onClick={() => go(1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
