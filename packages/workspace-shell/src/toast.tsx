import { useEffect } from 'react'
import { create } from 'zustand'
import { createPortal } from 'react-dom'
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

/**
 * Toasts, bottom right. On a phone they sit in a bar under the board instead,
 * which makes room for them rather than covering the bottom of the board (a
 * "Back to My week" toast stays until dismissed). Render it last in the
 * page's full-height column. The live region is always mounted (empty, and
 * no height, when there is nothing to say), so a screen reader announces the
 * first toast too. A toast stops counting down while the pointer or focus is
 * on it.
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

  const host = (
    <section aria-label="Notifications" className="contents">
      <div
        role="status"
        aria-live="polite"
        data-testid="toast-host"
        data-layout={narrow ? 'bar' : 'float'}
        className={
          narrow
            ? cn('flex shrink-0 flex-col gap-2', toasts.length > 0 && 'px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]')
            : 'fixed bottom-4 right-4 z-[20000] flex flex-col items-end gap-2'
        }
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
                narrow ? 'flex-wrap gap-y-1 py-2 pr-2 pl-3.5' : 'py-3 pr-3 pl-4 shadow-pop',
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
  return narrow ? host : createPortal(host, document.body)
}
