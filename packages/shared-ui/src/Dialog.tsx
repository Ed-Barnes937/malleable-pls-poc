import { useEffect, useRef, type ReactNode } from 'react'
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

/**
 * When each open dialog opened (a count, in render order, so one opened
 * from another, e.g. "New course..." in New board, is later even when both
 * mount at once): Escape closes only the latest.
 */
let opened = 0
const openDialogs = new Set<{ order: number }>()

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const order = useRef(0)
  if (!open) order.current = 0
  else if (order.current === 0) order.current = ++opened
  useEffect(() => {
    if (!open) return
    const self = { order: order.current }
    openDialogs.add(self)
    // Escape with the focus outside every dialog.
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && Math.max(...[...openDialogs].map((d) => d.order)) === self.order) onCloseRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => {
      openDialogs.delete(self)
      window.removeEventListener('keydown', handler)
    }
  }, [open])

  if (!open) return null

  return createPortal(
    // Above everything else in the page, the top bar (z 9999) and the
    // activity drawer (10003) included: a dialog is modal, and a full-screen
    // one (a note on a phone) would otherwise have its header covered.
    <div
      // Marks the dialog and its backdrop for code under it that reacts to
      // presses elsewhere (the calendar's popover closing): a dialog opened
      // from a popover is its React child but drawn outside it.
      data-modal-dialog=""
      className="fixed inset-0 z-[10010] flex items-center justify-center"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Escape inside closes this dialog alone: not one it was opened
        // from, nor a popover or menu under it.
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onCloseRef.current()
      }}
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
