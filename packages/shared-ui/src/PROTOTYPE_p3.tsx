/**
 * PROTOTYPE p3 - flow audit "Feedback and motion". Throwaway, never merged
 * (branch proto/p3-feedback-motion). Question for Ed: which changes get a
 * confirmation with Undo, how it is worded, and what the motion feels like.
 *
 * Three variants on the real app, switched by `?p3=`:
 *   a  Quiet    ~150ms fade. Undo toasts only for destructive or large
 *               changes (remove a widget, Tidy up, Accept a draft, delete).
 *               Drags and resizes get an inline highlight on the moved widget.
 *   b  Spatial  ~200ms scale-and-slide from the origin. An Undo toast for
 *               every change, drags and resizes included.
 *   c  Current  the app as it is on main (the default with no `?p3=`).
 *
 * Changing the variant reloads the page, so module state always matches it.
 * Everything gated here is marked `PROTOTYPE p3` where it is used.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { cn } from './utils'

export type P3Variant = 'a' | 'b' | 'c'
const ORDER: P3Variant[] = ['a', 'b', 'c']
export const P3_NAMES: Record<P3Variant, string> = { a: 'Quiet', b: 'Spatial', c: 'Current app' }

function readVariant(): P3Variant {
  if (typeof window === 'undefined') return 'c'
  const v = new URLSearchParams(window.location.search).get('p3')
  return v === 'a' || v === 'b' ? v : 'c'
}

/** The variant for this page load. */
export const p3: P3Variant = readVariant()
if (typeof document !== 'undefined') document.documentElement.dataset.p3 = p3

/**
 * What kind of change a confirmation is for:
 *   destructive  removes something (a widget, a block, a to-do)
 *   large        changes many things at once (Tidy up, Accept a draft)
 *   small        adds or edits one thing (add a widget, add or tick a to-do)
 *   gesture      a drag or resize of a widget
 */
export type P3Kind = 'destructive' | 'large' | 'small' | 'gesture'

export interface P3Confirmation {
  message: string
  kind: P3Kind
  undo?: () => unknown
  /** Same key replaces the one before (a run of drags is one toast). */
  key?: string
}

/** Whether this variant confirms a change of this kind with a toast. */
export function p3Wants(kind: P3Kind): boolean {
  if (p3 === 'b') return true
  if (p3 === 'a') return kind === 'destructive' || kind === 'large'
  return false
}

const confirmListeners = new Set<(c: P3Confirmation) => void>()

/**
 * Asks for a confirmation toast. Returns whether the variant shows one, so a
 * caller can drop its own current-app toast when the prototype took over.
 */
export function p3Confirm(c: P3Confirmation): boolean {
  if (!p3Wants(c.kind)) return false
  for (const l of confirmListeners) l(c)
  return true
}

/** The shell turns confirmations into toasts (WorkspaceShell). */
export function onP3Confirm(listener: (c: P3Confirmation) => void): () => void {
  confirmListeners.add(listener)
  return () => {
    confirmListeners.delete(listener)
  }
}

/**
 * Collects several confirmations made in one go (Accept all saves blocks
 * one at a time) into one toast with one Undo.
 */
export function p3Batcher(kind: P3Kind, key: string, message: (n: number) => string, waitMs = 250) {
  let undos: Array<() => unknown> = []
  let timer: ReturnType<typeof setTimeout> | null = null
  return (undo: () => unknown) => {
    if (!p3Wants(kind)) return
    undos.push(undo)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const all = undos
      undos = []
      timer = null
      p3Confirm({ kind, key, message: message(all.length), undo: () => Promise.all(all.map((u) => u())) })
    }, waitMs)
  }
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Motion props (motion/react) for an element entering and leaving, per variant. */
export function p3MotionProps(origin: 'center' | 'top' = 'center') {
  if (p3 === 'a' || reduced()) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: p3 === 'a' ? 0.15 : 0.12, ease: 'easeOut' as const },
    }
  }
  return {
    initial: { opacity: 0, scale: 0.92, y: origin === 'top' ? -8 : 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.92, y: origin === 'top' ? -8 : 10 },
    transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const },
  }
}

/** Variant A: a short accent ring on a widget that was just moved or resized. */
export function p3Flash(el: Element | null | undefined) {
  if (!el || p3 !== 'a') return
  el.removeAttribute('data-p3-flash')
  // Restart the animation if it is still running.
  void (el as HTMLElement).offsetWidth
  el.setAttribute('data-p3-flash', '')
  setTimeout(() => el.removeAttribute('data-p3-flash'), 1000)
}

/* ── Re-fit prompt shown once per board (decision 4) ── */

let calendars = 0
const presenceListeners = new Set<() => void>()
const notifyPresence = () => {
  for (const l of presenceListeners) l()
}

/** The Calendar registers while mounted, so the To-do knows to leave the re-fit prompt to it. */
export function useP3RegisterCalendar() {
  useEffect(() => {
    calendars += 1
    notifyPresence()
    return () => {
      calendars -= 1
      notifyPresence()
    }
  }, [])
}

/** Whether a Calendar is on the board in view. */
export function useP3CalendarOnBoard(): boolean {
  return useSyncExternalStore(
    (l) => {
      presenceListeners.add(l)
      return () => {
        presenceListeners.delete(l)
      }
    },
    () => calendars > 0,
    () => false,
  )
}

/* ── The switcher ── */

const isProd = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true

/** "p3" pill, bottom-centre-left: cycles A / B / C (a full reload). */
export function P3Switcher() {
  const [open, setOpen] = useState(true)
  if (isProd) return null
  const go = (dir: 1 | -1) => {
    const next = ORDER[(ORDER.indexOf(p3) + dir + ORDER.length) % ORDER.length]
    const url = new URL(window.location.href)
    url.searchParams.set('p3', next)
    window.location.assign(url.toString())
  }
  const btn = 'flex h-7 w-7 items-center justify-center rounded-full text-accent-foreground/80 hover:bg-accent-foreground/15 hover:text-accent-foreground'
  return (
    <div
      data-testid="p3-switcher"
      data-p3-variant={p3}
      className="fixed bottom-[0.85rem] left-[25%] z-[1000] -translate-x-1/2 select-none max-sm:bottom-[4.9rem]"
    >
      <div className={cn('flex items-center gap-1 rounded-full bg-accent px-1.5 py-1 text-meta font-semibold text-accent-foreground shadow-pop ring-2 ring-surface-raised')}>
        <button type="button" className={btn} aria-label="Previous p3 variant" onClick={() => go(-1)}>‹</button>
        <button type="button" className="px-1.5 whitespace-nowrap" onClick={() => setOpen((o) => !o)} title="PROTOTYPE p3: feedback and motion">
          p3 {p3.toUpperCase()}{open ? ` · ${P3_NAMES[p3]}` : ''}
        </button>
        <button type="button" className={btn} aria-label="Next p3 variant" onClick={() => go(1)}>›</button>
      </div>
    </div>
  )
}
