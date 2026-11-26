/**
 * Test-only harnesses for the overlay components (Playwright CT mounts
 * components from a file, and its props must be serialisable). Nothing in the
 * app imports this file.
 */
import { useRef, useState } from 'react'
import { AlertDialog, useConfirm } from './AlertDialog'
import { Dialog } from './Dialog'
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from './Drawer'
import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from './Menu'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from './Popover'
import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip'

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
          className="h-48 w-80"
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

/** A dialog and, on the page behind it, a button that counts its presses. */
export function DialogBesidePage() {
  const [open, setOpen] = useState(false)
  const [presses, setPresses] = useState(0)
  return (
    <div className="flex gap-3 p-6">
      <button type="button" onClick={() => setOpen(true)}>New board</button>
      <button type="button" onClick={() => setPresses((n) => n + 1)}>Pressed {presses}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New board">
        <input aria-label="Name" />
      </Dialog>
    </div>
  )
}

/** One of each overlay, as the app would use them. `onEvent` reports what ran. */
export function Overlays({ onEvent = () => {} }: { onEvent?: (event: string) => void }) {
  const [alertOpen, setAlertOpen] = useState(false)
  const { confirm, confirmDialog } = useConfirm()
  return (
    <div className="flex flex-wrap items-start gap-3 p-6">
      <Popover>
        <PopoverTrigger>Details</PopoverTrigger>
        <PopoverContent side="bottom" align="start">
          <PopoverTitle>Maths study</PopoverTitle>
          <PopoverDescription>Tuesday 14:00 to 15:00</PopoverDescription>
          <button type="button">Edit</button>
        </PopoverContent>
      </Popover>
      <Menu onAction={(value) => onEvent(`menu:${value}`)}>
        <MenuTrigger>Board menu</MenuTrigger>
        <MenuContent side="bottom" align="start">
          <MenuGroup>
            <MenuGroupLabel>Boards</MenuGroupLabel>
            <MenuItem value="rename">Rename</MenuItem>
            <MenuItem value="duplicate">Duplicate</MenuItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuItem value="delete" destructive>Delete</MenuItem>
        </MenuContent>
      </Menu>
      <Drawer side="right">
        <DrawerTrigger>Activity</DrawerTrigger>
        <DrawerContent>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <DrawerTitle>Activity</DrawerTitle>
            <DrawerClose>Close</DrawerClose>
          </div>
          <p className="px-5">Nothing running</p>
          <button type="button" className="px-5">Clear history</button>
        </DrawerContent>
      </Drawer>
      <Tooltip delay={0}>
        <TooltipTrigger aria-label="Add to calendar">+</TooltipTrigger>
        <TooltipContent>Add to calendar</TooltipContent>
      </Tooltip>
      <button type="button" onClick={() => setAlertOpen(true)}>Delete board</button>
      <AlertDialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        title="Delete board?"
        description="Its widgets and settings are removed."
        confirmLabel="Delete board"
        destructive
        onConfirm={() => onEvent('alert:confirmed')}
      />
      <button
        type="button"
        onClick={async () => onEvent(`confirm:${await confirm({ title: 'Delete it?', description: 'Maths study on Tuesday is removed.', confirmLabel: 'Delete', destructive: true })}`)}
      >
        Delete block
      </button>
      {confirmDialog}
    </div>
  )
}

/** A popover and a menu inside a dialog: Escape closes the inner layer first. */
export function LayersInDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>New automation</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New automation">
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger>Help</PopoverTrigger>
            <PopoverContent>
              <PopoverTitle>About automations</PopoverTitle>
            </PopoverContent>
          </Popover>
          <Menu>
            <MenuTrigger>When</MenuTrigger>
            <MenuContent>
              <MenuItem value="marked">I mark something confusing</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </Dialog>
    </>
  )
}

/** A dialog whose `initialFocus` names the second field, not the first thing Tab would reach. */
export function DialogInitialFocus() {
  const [open, setOpen] = useState(false)
  const second = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Fields" initialFocus={() => second.current}>
        <input aria-label="First" />
        <input ref={second} aria-label="Second" />
      </Dialog>
    </>
  )
}
