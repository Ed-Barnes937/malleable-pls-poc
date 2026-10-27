import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronLeft, XCircle, X, type LucideIcon } from 'lucide-react'
import { cn } from '@pls/shared-ui'

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
}

export interface ToastAction {
  label: string
  onClick: () => void
}

/** How long a toast stays: longer when it offers an action, so there is time to take it. */
export const TOAST_MS = 4000
export const ACTION_TOAST_MS = 8000

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

let nextId = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = ++nextId
    set((s) => ({
      toasts: [...s.toasts.filter((t) => !toast.key || t.key !== toast.key), { ...toast, id }],
    }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, toast.action ? ACTION_TOAST_MS : TOAST_MS)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-testid="toast-host"
      className="fixed bottom-4 left-4 right-4 z-[20000] flex flex-col items-end gap-2 sm:left-auto"
    >
      {toasts.map((toast) => {
        const Icon = toast.icon ?? (toast.tone === 'success' ? CheckCircle2 : XCircle)
        return (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 rounded-[14px] bg-inverse py-3 pr-3 pl-4 text-inverse-foreground shadow-pop',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-body">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                dismiss(toast.id)
                toast.action?.onClick()
              }}
              className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-item px-1.5 py-1 text-body font-semibold text-inverse-accent transition-colors hover:underline"
            >
              <ChevronLeft className="h-4 w-4" />
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
    </div>,
    document.body,
  )
}
