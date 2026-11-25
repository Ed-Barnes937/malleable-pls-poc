import { useEffect } from 'react'
import { CheckCircle2, XCircle, type LucideIcon } from 'lucide-react'
import { ToastBar, cn, createToaster, useNarrowScreen } from '@pls/shared-ui'
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

/** What a toast carries for our own rendering (UI SDK's `data`). */
interface ToastData {
  icon?: LucideIcon
  actionIcon?: LucideIcon
  board?: string
}

/**
 * The queue. UI SDK owns the timers (paused while the pointer or focus is in
 * the region, and while the page is hidden), the one-per-newest ordering with
 * the rest waiting their turn, announcements, Escape and F6 to reach the region.
 */
const toaster = createToaster<string>({ duration: TOAST_MS })

/** Toasts that go when their board is left. */
const boardOf = new Map<string, string>()

let nextId = 0

function durationOf(toast: Omit<Toast, 'id'>): number {
  if (toast.durationMs === null) return Infinity
  if (toast.durationMs !== undefined) return toast.durationMs
  return toast.action ? ACTION_TOAST_MS : TOAST_MS
}

/**
 * After a mouse press on Dismiss UI SDK moves focus to the next toast (right
 * for a keyboard user), and focus in the row holds every countdown, so the
 * toast that is left would stay until the student clicked elsewhere. A mouse
 * user has no focus to keep: let go of it.
 */
function letGoOfFocus() {
  requestAnimationFrame(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('[data-slot="toast-region"]')) active.blur()
  })
}

/**
 * UI SDK says the toasts that are on screen when it renders, so toasts pushed
 * in one burst would leave the oldest of them (waiting behind the newest few)
 * unsaid. Spacing them past its 100ms settle time lets each be said as it arrives, as before.
 */
const SPACING_MS = 120
let lastShownAt = 0
let queued = Promise.resolve()

function show(toast: Omit<Toast, 'id'>) {
  const id = toast.key ?? `toast-${++nextId}`
  const data: ToastData = { icon: toast.icon, actionIcon: toast.action?.icon, board: toast.board }
  if (toast.board) boardOf.set(id, toast.board)
  else boardOf.delete(id)
  toaster({
    id,
    title: toast.message,
    type: toast.tone,
    duration: durationOf(toast),
    // What a screen reader adds after the message (the bar keeps it out of sight).
    ...(toast.action ? { description: `Notifications has a ${toast.action.label} button.` } : {}),
    ...(toast.action
      ? { action: { label: toast.action.label, onAction: () => { toast.action?.onClick() } } }
      : {}),
    data,
    onDismiss: ({ reason, event }) => {
      boardOf.delete(id)
      if (reason === 'close-press' && event instanceof MouseEvent && event.detail > 0) letGoOfFocus()
    },
  })
  lastShownAt = Date.now()
}

function push(toast: Omit<Toast, 'id'>) {
  const wait = lastShownAt + SPACING_MS - Date.now()
  if (wait <= 0 && !pending) return show(toast)
  pending++
  queued = queued.then(() => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, lastShownAt + SPACING_MS - Date.now())))).then(() => {
    pending--
    show(toast)
  })
}
let pending = 0

function dismiss(id: string) {
  toaster.dismiss(id)
}

interface ToastState {
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

/**
 * The app's way to say something: `useToastStore((s) => s.push)(...)`, or
 * `useToastStore.getState().push(...)` outside a component. A facade over UI
 * SDK's toaster, so every call site is as it was.
 */
export const useToastStore = Object.assign(
  <T,>(select: (s: ToastState) => T): T => select(state),
  { getState: (): ToastState => state },
)
const state: ToastState = { push, dismiss }

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
 * UI SDK's region draws the toasts (on the top layer, laid over the bar) and
 * says each once to screen readers; F6 moves focus into it and back.
 */
export function ToastHost() {
  const activeBoard = useActiveWorkspaceId()
  const narrow = useNarrowScreen()

  // A toast about one board (e.g. "Back to My week" after opening a moment
  // there) goes once the student leaves it.
  useEffect(() => {
    for (const [id, board] of boardOf) if (board !== activeBoard) toaster.dismiss(id)
  }, [activeBoard])

  return (
    <div
      data-testid="toast-host"
      data-layout="bar"
      className={cn('shrink-0', narrow ? 'h-[4.25rem]' : 'h-16')}
    >
      <ToastBar
        toaster={toaster}
        narrow={narrow}
        maxVisible={narrow ? SHOWN_NARROW : SHOWN_WIDE}
        icon={(t) => {
          const Icon = (t.data as ToastData).icon ?? (t.type === 'success' ? CheckCircle2 : XCircle)
          return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        }}
        actionIcon={(t) => {
          const ActionIcon = (t.data as ToastData).actionIcon
          return ActionIcon ? <ActionIcon className="h-4 w-4" aria-hidden="true" /> : null
        }}
      />
    </div>
  )
}
