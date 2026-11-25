import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  Toast as SdkToast,
  ToastAction as SdkToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
  type Toaster,
  type ToastData,
} from '@ui-sdk/react/toast'
import { cn } from './utils'

export { createToaster, type Toaster, type ToastData }

export interface ToastBarProps {
  toaster: Toaster<any>
  /** How many toasts show at once; the rest wait their turn with their timers stopped. */
  maxVisible: number
  /** A phone: the toast fills the bar's width and its message takes two lines. */
  narrow?: boolean
  /** Shown before the message, from the toast the bar is drawing. */
  icon: (toast: ToastData<string>) => ReactNode
  /** Shown before the action's label (e.g. a back chevron). */
  actionIcon?: (toast: ToastData<string>) => ReactNode
}

/**
 * UI SDK's toast region dressed in our tokens, laid out as one row of dark
 * pills along the bottom edge (`ToastHost` reserves that strip). UI SDK keeps
 * the timers (paused while the pointer or focus is in the row, or the page is
 * hidden), says each toast once to screen readers, dismisses on Escape, and
 * F6 moves focus into the row and back.
 */
export function ToastBar({ toaster, maxVisible, narrow = false, icon, actionIcon }: ToastBarProps) {
  return (
    <ToastRegion
      toaster={toaster}
      side="bottom"
      align="end"
      // Always a flat row: no collapsed pile to peek out from behind.
      expanded
      maxVisible={maxVisible}
      aria-label="Notifications"
      data-layout={narrow ? 'narrow' : 'wide'}
      className={cn(
        'fixed bottom-0 flex flex-row-reverse items-center gap-2 overflow-hidden bg-transparent',
        narrow ? 'inset-x-0 h-[4.25rem] px-3 py-1.5' : 'right-0 h-16 px-5 py-2.5',
      )}
    >
      {(item) => (
        <SdkToast
          data-testid="toast"
          className={cn(
            'flex min-w-0 items-center gap-3 rounded-toast bg-inverse text-inverse-foreground',
            // One row whatever the width: on a phone it fills the bar and the message takes two lines at most.
            narrow ? 'h-14 flex-1 pr-2 pl-3.5' : 'h-11 pr-3 pl-4 shadow-pop',
          )}
        >
          {icon(item as ToastData<string>)}
          <ToastTitle className={cn('min-w-0 text-body', narrow ? 'line-clamp-2 flex-1 leading-tight' : 'truncate')} />
          {/* Said after the message by screen readers, not shown. */}
          <ToastDescription className="sr-only" />
          {item.action && (
            <SdkToastAction className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-item px-1.5 py-1 text-body font-semibold text-inverse-accent transition-colors hover:underline">
              {actionIcon?.(item as ToastData<string>)}
              {item.action.label}
            </SdkToastAction>
          )}
          <ToastClose
            aria-label="Dismiss"
            title="Dismiss"
            className="ml-1 rounded-item p-1 text-inverse-foreground/70 transition-colors hover:text-inverse-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ToastClose>
        </SdkToast>
      )}
    </ToastRegion>
  )
}
