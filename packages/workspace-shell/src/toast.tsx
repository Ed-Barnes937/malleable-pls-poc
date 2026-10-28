import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { create } from 'zustand'
import { CheckCircle2, XCircle, X, type LucideIcon } from 'lucide-react'
import { cn, useNarrowScreen } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'

export type ToastTone = 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  /**
   * Toasts sharing a key replace each other instead of stacking, e.g. one
   * "Transcript added" toast while a student adds several widgets in a row.
   */
  key?: string
  /** Replaces the tone's icon, e.g. a lecture waveform for "Opened 1:18 in In Lecture". */
  icon?: LucideIcon
  /** One follow-up, e.g. "Back to My week". Clicking it also dismisses the toast. */
  action?: ToastAction
  /**
   * How long it stays, in ms (paused while hovered or focused). Defaults to
   * `TOAST_MS`, or `ACTION_TOAST_MS` with an action; `null` keeps it until
   * dismissed (or until its `board` is left).
   */
  durationMs?: number | null
  /** Only meaningful on this board: leaving it dismisses the toast. */
  board?: string
}

export interface ToastAction {
  label: string
  onClick: () => void
  /** Shown before the label, e.g. a back chevron for "Back to My week". */
  icon?: LucideIcon
}

/** How long a toast stays: longer when it offers an action, so there is time to take it. */
export const TOAST_MS = 4000
export const ACTION_TOAST_MS = 8000

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
  /** Stops a toast's countdown (hover, focus). */
  hold: (id: number) => void
  /** Starts it again, from its full duration. */
  release: (id: number) => void
}

let nextId = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function durationOf(toast: Omit<Toast, 'id'>): number | null {
  if (toast.durationMs !== undefined) return toast.durationMs
  return toast.action ? ACTION_TOAST_MS : TOAST_MS
}

export const useToastStore = create<ToastState>((set, get) => {
  const clear = (id: number) => {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }
  const schedule = (toast: Toast) => {
    clear(toast.id)
    const ms = durationOf(toast)
    if (ms === null) return
    timers.set(toast.id, setTimeout(() => get().dismiss(toast.id), ms))
  }
  return {
    toasts: [],
    push: (toast) => {
      const next = { ...toast, id: ++nextId }
      const replaced = get().toasts.filter((t) => toast.key && t.key === toast.key)
      for (const t of replaced) clear(t.id)
      set((s) => ({ toasts: [...s.toasts.filter((t) => !toast.key || t.key !== toast.key), next] }))
      schedule(next)
    },
    dismiss: (id) => {
      clear(id)
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    },
    hold: (id) => clear(id),
    release: (id) => {
      const toast = get().toasts.find((t) => t.id === id)
      if (toast) schedule(toast)
    },
  }
})

/** The board's scrolling area (see `CanvasEngine`). */
const BOARD = '[data-canvas-scroll]'

/**
 * Keeps the board's content where it is on screen as the toast bar under it
 * grows and shrinks. Growing only hides the board's bottom edge (the content
 * stays put). Shrinking at the board's bottom would let the scroll position
 * fall back and move everything under the pointer, so the board gets just
 * enough slack at its bottom (`--board-slack`, laid out by `CanvasEngine`) to
 * stay where it was; the slack goes again as the student scrolls up, or
 * leaves the board.
 */
function useBoardStaysPut(hostRef: RefObject<HTMLElement | null>, board: string) {
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const scroller = () => document.querySelector<HTMLElement>(BOARD)
    const slackOf = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('--board-slack')) || 0
    const setSlack = (el: HTMLElement, px: number) => el.style.setProperty('--board-slack', `${Math.max(0, Math.round(px))}px`)
    /** No more slack than holding the current position needs. */
    const trim = (el: HTMLElement) => {
      const slack = slackOf(el)
      if (slack > 0) setSlack(el, el.scrollTop + el.clientHeight - (el.scrollHeight - slack))
    }
    let height = host.offsetHeight
    // Where the board was just before the toasts changed: read as the store
    // changes, before React removes a toast and the layout clamps the scroll.
    let lastTop = scroller()?.scrollTop ?? 0
    const unsubscribe = useToastStore.subscribe(() => {
      lastTop = scroller()?.scrollTop ?? 0
    })
    const onScroll = (e: Event) => {
      const el = e.target
      if (el instanceof HTMLElement && el.matches(BOARD)) trim(el)
    }
    const observer = new ResizeObserver(() => {
      const next = host.offsetHeight
      const shrank = next < height
      height = next
      const el = scroller()
      if (!el) return
      if (!shrank) return trim(el)
      const top = lastTop
      setSlack(el, top + el.clientHeight - (el.scrollHeight - slackOf(el)))
      el.scrollTop = top
    })
    observer.observe(host)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      unsubscribe()
      observer.disconnect()
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [hostRef])
  // Another board starts without slack.
  useEffect(() => {
    document.querySelector<HTMLElement>(BOARD)?.style.removeProperty('--board-slack')
  }, [board])
}

/**
 * Toasts sit in a bar under the board, which makes room for them rather than
 * covering the widgets at the bottom of the board (a "Back to My week" toast
 * stays until dismissed): full width on a phone, at the right on a wider
 * screen. Render it last in the page's full-height column. The live region
 * is always mounted (empty, and no height, when there is nothing to say), so
 * a screen reader announces the first toast too. A toast stops counting down
 * while the pointer or focus is on it.
 */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const { dismiss, hold, release } = useToastStore.getState()
  const activeBoard = useWorkspaceStore((s) => s.activeWorkspaceId)
  const narrow = useNarrowScreen()

  // A toast about one board (e.g. "Back to My week" after opening a moment
  // there) goes once the student leaves it.
  useEffect(() => {
    for (const t of toasts) if (t.board && t.board !== activeBoard) dismiss(t.id)
  }, [toasts, activeBoard, dismiss])

  const hostRef = useRef<HTMLDivElement>(null)
  useBoardStaysPut(hostRef, activeBoard)

  return (
    <section aria-label="Notifications" className="contents">
      <div
        ref={hostRef}
        role="status"
        aria-live="polite"
        data-testid="toast-host"
        data-layout="bar"
        className={cn(
          'flex shrink-0 gap-2',
          narrow ? 'flex-col' : 'flex-wrap-reverse items-center justify-end',
          toasts.length > 0 && (narrow ? 'px-3 pt-2 pb-3' : 'px-5 pt-2 pb-3'),
        )}
      >
        {toasts.map((toast) => {
          const Icon = toast.icon ?? (toast.tone === 'success' ? CheckCircle2 : XCircle)
          const ActionIcon = toast.action?.icon
          return (
            <div
              key={toast.id}
              data-testid="toast"
              onMouseEnter={() => hold(toast.id)}
              onMouseLeave={() => release(toast.id)}
              onFocus={() => hold(toast.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release(toast.id)
              }}
              className={cn(
                'flex items-center gap-3 rounded-[14px] bg-inverse text-inverse-foreground',
                // A phone's narrow bar: the message keeps a readable width and
                // the action (with the dismiss) drops under it when it must.
                narrow ? 'flex-wrap gap-y-1 py-2 pr-2 pl-3.5' : 'py-2.5 pr-3 pl-4 shadow-pop',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn('text-body', narrow && 'min-w-48 flex-1')}>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(toast.id)
                    toast.action?.onClick()
                  }}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-item px-1.5 py-1 text-body font-semibold text-inverse-accent transition-colors hover:underline',
                    narrow && 'ml-auto',
                  )}
                >
                  {ActionIcon && <ActionIcon className="h-4 w-4" />}
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                title="Dismiss"
                className="ml-1 rounded-item p-1 text-inverse-foreground/70 transition-colors hover:text-inverse-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
