/** What a calendar popover is saving: its button reads as pending until the save lands. */
export type PendingAction = 'add' | 'save' | 'done' | 'delete'

/** "Saving...": the pressed button's label while it waits. `done` is whether the item was done. */
export function pendingLabel(action: PendingAction, done = false): string {
  switch (action) {
    case 'add': return 'Adding...'
    case 'save': return 'Saving...'
    case 'done': return done ? 'Saving...' : 'Marking done...'
    case 'delete': return 'Deleting...'
  }
}

/**
 * Says the pending label to screen readers too (a changed button label isn't
 * announced). Always mounted, so the first change is heard.
 */
export function PendingStatus({ pending, done = false }: { pending?: PendingAction | null; done?: boolean }) {
  return (
    <p role="status" className="sr-only">
      {pending ? pendingLabel(pending, done) : ''}
    </p>
  )
}
