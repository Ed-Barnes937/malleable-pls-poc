/**
 * Test-only harnesses for the overlay components (Playwright CT mounts
 * components from a file, and its props must be serialisable). Nothing in the
 * app imports this file.
 */
import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@ui-sdk/react/popover'
import { Dialog } from './Dialog'

/**
 * The calendar case: a popover stays open (as the calendar keeps its block
 * popover open) and a button in it opens a shared Dialog rendered elsewhere
 * in the tree (as WorkspaceShell renders AutomationDialog).
 */
export function DialogFromPopover() {
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <div className="flex h-screen items-center justify-center">
      <Popover
        onOpenChange={(open, details) => {
          // The calendar closes its popover itself; only Escape and the trigger close this one.
          if (!open && ['outside-press', 'focus-out', 'window-blur'].includes(details.reason)) details.cancel()
        }}
      >
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent
          side="bottom"
          sideOffset={-40}
          className="h-48 w-80 rounded-widget border border-border-subtle bg-surface-raised p-4 shadow-pop"
        >
          <PopoverTitle>Block</PopoverTitle>
          <button type="button" onClick={() => setDialogOpen(true)}>
            Edit automation
          </button>
        </PopoverContent>
      </Popover>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Automation">
        <p className="h-40 w-80">Automation body</p>
      </Dialog>
    </div>
  )
}

/** A dialog that opens a second one beside it (AutomationDialog and its WorkflowEditor). */
export function StackedDialogs() {
  const [first, setFirst] = useState(false)
  const [second, setSecond] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setFirst(true)}>Automations</button>
      <Dialog open={first} onClose={() => setFirst(false)} title="Automations">
        <button type="button" onClick={() => setSecond(true)}>Edit</button>
        <button type="button">Delete</button>
      </Dialog>
      <Dialog open={second} onClose={() => setSecond(false)} title="Edit automation">
        <input aria-label="Sentence" />
      </Dialog>
    </>
  )
}
