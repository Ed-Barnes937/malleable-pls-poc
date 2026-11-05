import { createContext, useContext } from 'react'

/**
 * A change the student made that is big enough to confirm with Undo
 * (flow-audit decision 19): removing a widget, accepting a draft, deleting a
 * block or a to-do, Tidy up. Drags and resizes get an inline highlight
 * instead, and changes made by an automation keep their toast without Undo
 * (decision 24).
 */
export interface UndoableChange {
  /**
   * Changes of one kind share a key, so a run of them is one toast. The
   * newest replaces the one before, and its Undo undoes only the newest
   * change: Undo never reaches past the change it names.
   */
  key: string
  /** What happened, e.g. `Deleted "Biology lecture"`. */
  message: string
  /** Puts it back exactly. A rejection shows `failMessage`. */
  undo: () => Promise<unknown>
  /** Shown when Undo fails. Defaults to "Couldn't undo that. Try again from where you made the change." */
  failMessage?: string
  /** The board the change belongs to: leaving it dismisses the toast (a widget removal, Tidy up). */
  board?: string
}

/** Pushes the toast. Outside a shell (tests, a bare widget) nothing is shown. */
export type ConfirmChange = (change: UndoableChange) => void

const UndoToastContext = createContext<ConfirmChange>(() => {})

/** The shell provides the toast (workspace-shell `pushUndoToast`). */
export const UndoToastProvider = UndoToastContext.Provider

/** Confirms a change with an Undo toast; see UndoableChange for which changes get one. */
export function useUndoToast(): ConfirmChange {
  return useContext(UndoToastContext)
}
