import { type ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  Dialog as UiDialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@ui-sdk/react/dialog'
import { cn } from './utils'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

/**
 * Modal dialogs ease in and out. UI SDK keeps a closing modal mounted until
 * its animations end, so both parts ignore presses once closed (`data-closed`):
 * a quick press on the page right after closing reaches the page, not the
 * fading backdrop.
 */

/** The dimmed page behind a modal dialog (also used by AlertDialog). */
export const BACKDROP_CLASS =
  'fixed inset-0 bg-scrim transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 data-closed:pointer-events-none motion-reduce:transition-none'

/** The dialog box itself, centred on the top layer (also used by AlertDialog). */
export const DIALOG_CLASS =
  'fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-widget border border-border-subtle bg-surface-raised p-5 text-body text-text-primary shadow-pop outline-none transition-[opacity,scale] duration-150 data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 data-closed:pointer-events-none motion-reduce:transition-none'

const CLOSE_CLASS =
  'rounded-item p-1.5 text-text-muted hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent'

/**
 * A modal dialog on the browser's top layer (UI SDK Dialog), so it draws above
 * any popover it was opened from. Escape closes the topmost dialog only, a
 * press on the backdrop closes it, Tab stays inside, and focus returns to
 * where it was when it closes.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  return (
    <UiDialog
      open={open}
      modal={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogBackdrop data-testid="dialog-backdrop" className={BACKDROP_CLASS} />
      <DialogContent
        // It renders in place, so presses would otherwise bubble to what it sits in (a panel's drag).
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(DIALOG_CLASS, className)}
      >
        {title ? (
          <div className="mb-3 flex items-center justify-between">
            <DialogTitle className="text-title font-semibold">{title}</DialogTitle>
            <DialogClose aria-label="Close" className={CLOSE_CLASS}>
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
        ) : (
          <DialogClose aria-label="Close" className={cn(CLOSE_CLASS, 'absolute right-3 top-3')}>
            <X className="h-4 w-4" />
          </DialogClose>
        )}
        {children}
      </DialogContent>
    </UiDialog>
  )
}
