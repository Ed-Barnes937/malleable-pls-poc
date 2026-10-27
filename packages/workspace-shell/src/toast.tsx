import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { ArrowRight, CheckCircle2, XCircle, X } from 'lucide-react'
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
  /** One follow-up, e.g. "See it" on "Review added to your plan". Clicking it also dismisses the toast. */
  action?: { label: string; onClick: () => void }
}

/** Long enough to read the message; a toast with an action stays longer, so there is time to reach it. */
const TOAST_MS = 4000
const TOAST_WITH_ACTION_MS = 8000

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
    }, toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS)
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
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-3 rounded-[14px] bg-inverse py-3 pr-3 pl-4 text-inverse-foreground shadow-pop',
          )}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="text-body">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                dismiss(toast.id)
                toast.action!.onClick()
              }}
              className="ml-1 inline-flex items-center gap-1 rounded-item px-1 text-body font-semibold text-inverse-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-accent"
            >
              {toast.action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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
      ))}
    </div>,
    document.body,
  )
}
