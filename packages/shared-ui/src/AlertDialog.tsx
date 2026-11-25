import { useState, type ReactNode } from 'react'
import {
  AlertDialog as UiAlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createConfirm,
} from '@ui-sdk/react/alert-dialog'
import { BACKDROP_CLASS, DIALOG_CLASS } from './Dialog'
import { cn } from './utils'

const BUTTON = 'h-9 rounded-control px-3.5 text-body font-medium transition-colors disabled:opacity-40 aria-disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const CANCEL = cn(BUTTON, 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary')
const confirmClass = (destructive?: boolean) =>
  cn(BUTTON, destructive ? 'bg-confused text-surface-raised hover:bg-confused/90' : 'bg-accent text-accent-foreground hover:bg-accent/90')

export interface ConfirmRequest {
  title: string
  /** What agreeing does. Required: an alert dialog is described by its message (APG). */
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}

export interface AlertDialogProps extends ConfirmRequest {
  open: boolean
  onClose: () => void
  /** Runs on the confirm button. A Promise keeps the dialog open (and the button pending) until it settles; a rejection keeps it open and shows its message. */
  onConfirm: () => unknown
  /** The confirm button's text while `onConfirm` runs. */
  pendingLabel?: string
}

function Body({ title, description, cancelLabel = 'Cancel', children }: Omit<ConfirmRequest, 'confirmLabel' | 'destructive'> & { children: ReactNode }) {
  return (
    <>
      <AlertDialogTitle className="mb-2 text-title font-semibold">{title}</AlertDialogTitle>
      <AlertDialogDescription className="mb-4 text-body text-text-secondary">{description}</AlertDialogDescription>
      <div className="flex justify-end gap-2">
        {/* First, so it takes focus when the dialog opens: the least destructive answer. */}
        <AlertDialogClose className={CANCEL}>{cancelLabel}</AlertDialogClose>
        {children}
      </div>
    </>
  )
}

/**
 * A question that needs an answer before going on (UI SDK Alert Dialog): modal,
 * on the top layer, focus starts on Cancel, Escape cancels, a press outside
 * does nothing.
 */
export function AlertDialog({ open, onClose, onConfirm, confirmLabel, pendingLabel, destructive, ...body }: AlertDialogProps) {
  return (
    <UiAlertDialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <AlertDialogBackdrop className={BACKDROP_CLASS} />
      <AlertDialogContent onPointerDown={(e) => e.stopPropagation()} className={DIALOG_CLASS}>
        <Body {...body}>
          <AlertDialogClose
            value="confirm"
            action={() => onConfirm()}
            className={confirmClass(destructive)}
            render={(props, state) => (
              <>
                {state.error instanceof Error && (
                  <p role="alert" className="mr-auto self-center text-meta text-confused">{state.error.message}</p>
                )}
                <button {...props}>{state.pending && pendingLabel ? pendingLabel : confirmLabel}</button>
              </>
            )}
          />
        </Body>
      </AlertDialogContent>
    </UiAlertDialog>
  )
}

/**
 * Ask from an event handler and await the answer:
 *
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (await confirm({ title: 'Delete it?', description: '...', confirmLabel: 'Delete', destructive: true })) remove()
 *   ...render {confirmDialog} once
 *
 * Resolves true only for the confirm button; Cancel and Escape resolve false.
 */
export function useConfirm() {
  const [confirm] = useState(() => createConfirm<ConfirmRequest>())
  const confirmDialog = (
    <UiAlertDialog controller={confirm.controller}>
      <AlertDialogBackdrop className={BACKDROP_CLASS} />
      <AlertDialogContent<ConfirmRequest> onPointerDown={(e) => e.stopPropagation()} className={DIALOG_CLASS}>
        {(state) =>
          state.payload && (
            <Body {...state.payload}>
              <AlertDialogClose value="confirm" className={confirmClass(state.payload.destructive)}>
                {state.payload.confirmLabel}
              </AlertDialogClose>
            </Body>
          )
        }
      </AlertDialogContent>
    </UiAlertDialog>
  )
  return { confirm: confirm as (request: ConfirmRequest) => Promise<boolean>, confirmDialog }
}
