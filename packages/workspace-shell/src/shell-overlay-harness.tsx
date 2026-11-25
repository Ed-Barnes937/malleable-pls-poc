/**
 * Test-only harness: the board menu opened from a button outside it, as
 * WorkspaceShell does. Playwright CT props must be serialisable, so the
 * open state lives here. Nothing in the app imports this file.
 */
import { useState } from 'react'
import { DrawerSidebar } from './DrawerSidebar'

export function BoardMenuHarness() {
  const [open, setOpen] = useState(false)
  const [presses, setPresses] = useState(0)
  return (
    <div className="p-4">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        Open board menu
      </button>
      <button type="button" onClick={() => setPresses((n) => n + 1)}>
        Pressed {presses}
      </button>
      <DrawerSidebar open={open} onClose={() => setOpen(false)} onAddWidget={() => {}} />
    </div>
  )
}
