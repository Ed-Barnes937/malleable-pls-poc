import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from './utils'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        data-testid="dialog-backdrop"
        className="absolute inset-0 bg-scrim"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 max-w-md rounded-widget border border-border-subtle bg-surface-raised p-5 text-body text-text-primary shadow-pop',
          className,
        )}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-title font-semibold">{title}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-item p-1.5 text-text-muted hover:bg-surface-overlay hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {!title && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-item p-1.5 text-text-muted hover:bg-surface-overlay hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
