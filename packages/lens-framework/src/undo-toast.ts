import type { LensNotice } from './types'

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
}

/**
 * The notice that confirms `change` with Undo, for `LensProps.onNotify` (or
 * the shell's own toast). Undo runs the change's `undo`; if that fails,
 * `notify` says so.
 */
export function undoNotice(change: UndoableChange, notify: (notice: LensNotice) => void): LensNotice {
  return {
    message: change.message,
    key: change.key,
    action: {
      label: 'Undo',
      kind: 'undo',
      onClick: () => {
        change.undo().catch(() => notify({
          message: change.failMessage ?? "Couldn't undo that. Try again from where you made the change.",
          key: `${change.key}:undo-failed`,
          tone: 'error',
        }))
      },
    },
  }
}

/** Confirms a change with Undo through `onNotify`; nothing when the widget has no shell to say it in. */
export function confirmWithUndo(onNotify: ((notice: LensNotice) => void) | undefined, change: UndoableChange) {
  if (onNotify) onNotify(undoNotice(change, onNotify))
}
