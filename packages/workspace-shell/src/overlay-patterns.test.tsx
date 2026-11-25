import { useState, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, it, vi } from 'vitest'
import { checkPattern, settle } from '@pls/shared-ui/src/testing'

// The shell's data hooks need a server; stub each one with an empty, idle result.
// These tests are about the overlays' markup, roles and keyboard contract, not the data.
vi.mock('@pls/substrate-client', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  const idle = (name: string) => () =>
    name === 'useWorkspaces'
      ? { data: [{ id: 'ws-1', name: 'My week' }], isLoading: false }
      : name === 'useRunningJobCount'
        ? { data: 0 }
        : { data: undefined, isLoading: false, isError: false, error: null, isPending: false, mutate: () => {}, mutateAsync: async () => {} }
  return Object.fromEntries(
    Object.entries(real).map(([k, v]) => [k, /^use[A-Z]/.test(k) ? idle(k) : v]),
  )
})
vi.mock('./activeBoard', () => ({ useActiveWorkspaceId: () => 'ws-1' }))
vi.mock('@pls/lens-framework', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useManifests: () => [],
  useManifest: () => ({ id: 'transcript', label: 'Transcript', emits: ['tag:created'] }),
}))

import { DrawerSidebar } from './DrawerSidebar'
import { JobStatusIndicator } from './JobStatusIndicator'
import { TopBar } from './TopBar'
import { CreateWorkspaceDialog, DeleteWorkspaceDialog } from './WorkspaceDialogs'
import { LensAutomationsButton } from './LensAutomationsButton'
import { AutomationDialog } from './AutomationDialog'

// jsdom lacks these; a Drawer measures its sheet and a Menu scrolls its highlighted item into view.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView ??= () => {}
  // A wide screen.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})

/** The caller's side: a button that opens it, and a close it can be asked for (focus must have somewhere to return to). */
function Open({ children }: { children: (open: boolean, close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      {children(open, () => setOpen(false))}
    </>
  )
}

async function openIt() {
  await userEvent.click(screen.getByRole('button', { name: 'Open it' }))
  await act(settle)
}

describe('the shell overlays meet their WAI-ARIA patterns', () => {
  it('Board menu (a modal dialog)', async () => {
    render(<Open>{(open, close) => <DrawerSidebar open={open} onClose={close} onAddWidget={() => {}} />}</Open>)
    await openIt()
    await checkPattern(screen.getByRole('dialog', { name: 'Board menu' }), 'dialog')
  })

  it('Activity (a modal dialog)', async () => {
    render(<JobStatusIndicator />)
    await userEvent.click(screen.getByTestId('activity-button'))
    await act(settle)
    await checkPattern(screen.getByRole('dialog', { name: 'Activity' }), 'dialog')
  })

  it('Board appearance (a non-modal dialog)', async () => {
    // Tab leaves a non-modal popover, so the page has something after it to land on.
    render(<><TopBar onMenuClick={() => {}} /><button type="button">After the top bar</button></>)
    await userEvent.click(screen.getByRole('button', { name: 'Board appearance' }))
    await act(settle)
    await checkPattern(screen.getByRole('dialog', { name: 'Board appearance' }), 'dialog')
  })

  it('Delete board (an alert dialog)', async () => {
    render(<Open>{(open, close) => <DeleteWorkspaceDialog open={open} onClose={close} workspace={{ id: 'ws-1', name: 'My week' }} />}</Open>)
    await openIt()
    await checkPattern(screen.getByRole('alertdialog', { name: 'Delete board' }), 'alertdialog')
  })

  it('New board', async () => {
    render(<Open>{(open, close) => <CreateWorkspaceDialog open={open} onClose={close} />}</Open>)
    await openIt()
    await checkPattern(screen.getByRole('dialog', { name: 'New board' }), 'dialog')
  })

  it("A widget's Automations", async () => {
    render(<LensAutomationsButton panelId="p1" lensType="transcript" workspaceId="ws-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Automations for Transcript' }))
    await act(settle)
    await checkPattern(screen.getByRole('dialog', { name: /^Automations/ }), 'dialog')
  })

  it('One automation, opened from a calendar block', async () => {
    render(<Open>{(open, close) => (open ? <AutomationDialog workflowId="wf-1" workspaceId="ws-1" onClose={close} /> : null)}</Open>)
    await openIt()
    await checkPattern(screen.getByRole('dialog', { name: 'Automation' }), 'dialog')
  })
})
