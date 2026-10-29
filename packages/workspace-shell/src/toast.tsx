import { useEffect } from 'react'
import { create } from 'zustand'
import { CheckCircle2, XCircle, X, type LucideIcon } from 'lucide-react'
import { cn, useNarrowScreen } from '@pls/shared-ui'
import { useActiveWorkspaceId } from './activeBoard'

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
  /**
   * The toasts on screen now (`ToastHost`). Only these count down: one
   * waiting behind newer ones pauses and, shown again, has the rest of its
   * time, so every toast is on screen for its whole duration.
   */
  setShown: (ids: ReadonlyArray<number>) => void
}

let nextId = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()
/** Time each toast still has on screen, and when its current countdown started. */
const left = new Map<number, number>()
const startedAt = new Map<number, number>()
const shownIds = new Set<number>()
const heldIds = new Set<number>()

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
  /** Stops the countdown, keeping the time left. */
  const pause = (id: number) => {
    if (!timers.has(id)) return
    left.set(id, Math.max(0, (left.get(id) ?? 0) - (Date.now() - (startedAt.get(id) ?? Date.now()))))
    clear(id)
  }
  /** Counts down the time left, if it is on screen and nobody is holding it. */
  const resume = (id: number) => {
    const ms = left.get(id)
    if (ms === undefined || timers.has(id) || !shownIds.has(id) || heldIds.has(id)) return
    startedAt.set(id, Date.now())
    timers.set(id, setTimeout(() => get().dismiss(id), ms))
  }
  const forget = (id: number) => {
    clear(id)
    left.delete(id)
    startedAt.delete(id)
    shownIds.delete(id)
    heldIds.delete(id)
  }
  return {
    toasts: [],
    push: (toast) => {
      const next = { ...toast, id: ++nextId }
      const replaced = get().toasts.filter((t) => toast.key && t.key === toast.key)
      for (const t of replaced) forget(t.id)
      const ms = durationOf(next)
      if (ms !== null) left.set(next.id, ms)
      set((s) => ({ toasts: [...s.toasts.filter((t) => !toast.key || t.key !== toast.key), next] }))
    },
    dismiss: (id) => {
      forget(id)
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    },
    hold: (id) => {
      pause(id)
      heldIds.add(id)
    },
    release: (id) => {
      const toast = get().toasts.find((t) => t.id === id)
      heldIds.delete(id)
      if (!toast) return
      const ms = durationOf(toast)
      if (ms === null) return
      clear(id)
      left.set(id, ms)
      resume(id)
    },
    setShown: (ids) => {
      const next = new Set(ids)
      for (const id of [...shownIds]) {
        if (next.has(id)) continue
        pause(id)
        shownIds.delete(id)
        // Its element is gone, so no mouse-leave or blur will release it: it
        // counts down again when it is back on screen.
        heldIds.delete(id)
      }
      for (const id of next) {
        shownIds.add(id)
        resume(id)
      }
    },
  }
})

/**
 * What a screen reader hears for a toast: its message, and its action when
 * it has one, so the student knows there is a button to go to, and where
 * ("Review added to your plan. Notifications has a See it button.").
 */
export function announcement(toast: Pick<Toast, 'message' | 'action'>): string {
  return toast.action ? `${toast.message}. Notifications has a ${toast.action.label} button.` : toast.message
}

/** How many toasts the bar shows at once: it has room for one row. */
const SHOWN_WIDE = 2
const SHOWN_NARROW = 1

/**
 * Toasts sit in a bar of their own under the board: always there and always
 * the same height (empty when there is nothing to say), so a toast never
 * covers the board and nothing on the board moves as toasts come and go.
 * At the right on a wider screen, newest last, two at most; on a phone the
 * newest one, full width (an older one shows again once newer ones go).
 * Render it last in the page's full-height column. A toast counts down
 * only while it is on screen, and not while the pointer or focus is on it.
 *
 * Screen readers hear each toast once, as it happens, from a separate live
 * region that always holds every current toast's message (always mounted,
 * so the first toast is announced too); the bar itself isn't live, so a
 * toast shown again after waiting behind newer ones isn't announced twice.
 */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const { dismiss, hold, release } = useToastStore.getState()
  const activeBoard = useActiveWorkspaceId()
  const narrow = useNarrowScreen()

  // A toast about one board (e.g. "Back to My week" after opening a moment
  // there) goes once the student leaves it.
  useEffect(() => {
    for (const t of toasts) if (t.board && t.board !== activeBoard) dismiss(t.id)
  }, [toasts, activeBoard, dismiss])

  const shown = toasts.slice(-(narrow ? SHOWN_NARROW : SHOWN_WIDE))
  const shownKey = shown.map((t) => t.id).join(',')
  useEffect(() => {
    useToastStore.getState().setShown(shownKey ? shownKey.split(',').map(Number) : [])
  }, [shownKey])

  return (
    <section aria-label="Notifications" className="contents">
      <div role="status" aria-live="polite" data-testid="toast-announcer" className="sr-only">
        {toasts.map((toast) => <p key={toast.id}>{announcement(toast)}</p>)}
      </div>
      <div
        data-testid="toast-host"
        data-layout="bar"
        className={cn(
          'flex shrink-0 items-center gap-2 overflow-hidden',
          narrow ? 'h-[4.25rem] px-3 py-1.5' : 'h-16 justify-end px-5 py-2.5',
        )}
      >
        {shown.map((toast) => {
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
                'flex min-w-0 items-center gap-3 rounded-toast bg-inverse text-inverse-foreground',
                // One row whatever the width: on a phone it fills the bar and
                // the message takes two lines at most.
                narrow ? 'h-14 flex-1 pr-2 pl-3.5' : 'h-11 pr-3 pl-4 shadow-pop',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn('min-w-0 text-body', narrow ? 'line-clamp-2 flex-1 leading-tight' : 'truncate')}>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(toast.id)
                    toast.action?.onClick()
                  }}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-item px-1.5 py-1 text-body font-semibold text-inverse-accent transition-colors hover:underline',
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
