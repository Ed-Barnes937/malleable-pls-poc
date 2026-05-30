import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, X } from 'lucide-react'
import { cn } from '@pls/shared-ui'

export type ToastTone = 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

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
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 shadow-xl',
            'bg-surface-raised',
            toast.tone === 'success' ? 'border-emerald-500/30' : 'border-red-500/30',
          )}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span className="text-xs text-neutral-200">{toast.message}</span>
          <button
            onClick={() => dismiss(toast.id)}
            className="ml-1 rounded p-0.5 text-neutral-600 transition-colors hover:bg-surface-overlay hover:text-neutral-300"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
