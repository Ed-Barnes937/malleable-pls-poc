import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { CreateWorkspaceDialog, DeleteWorkspaceDialog } from './WorkspaceDialogs'

const board = { id: 'ws-evening-review', name: 'Evening Review' }

test('an aborted delete keeps the dialog open with focus inside it, and can be retried by keyboard', async ({ mount, page, simulator, consoleErrors }) => {
  consoleErrors.allowFailedRequest('workspaces.delete')
  let closed = false
  let attempts = 0
  await page.route((url) => url.pathname.split(/[/,]/).includes('workspaces.delete'), async (route) => {
    attempts += 1
    if (attempts === 1) await route.abort()
    else await route.fallback()
  })
  await mount(
    <ShellProviders>
      <DeleteWorkspaceDialog open onClose={() => { closed = true }} workspace={board} />
    </ShellProviders>,
  )

  const dialog = page.getByRole('alertdialog', { name: 'Delete board' })
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Delete board' })).toBeFocused()
  await page.keyboard.press('Enter')

  // The request failed: the dialog says so, stays open, and focus never left it.
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  expect(closed).toBe(false)

  // Tab from where focus landed stays in the dialog, and Delete works the second time.
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await dialog.getByRole('button', { name: 'Delete board' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => closed).toBe(true)
  expect(simulator.db.workspaces.some((w) => w.id === board.id)).toBe(false)
})

test('the dialog names the board, Cancel keeps it', async ({ mount, page, simulator }) => {
  let closed = false
  await mount(
    <ShellProviders>
      <DeleteWorkspaceDialog open onClose={() => { closed = true }} workspace={board} />
    </ShellProviders>,
  )
  const dialog = page.getByRole('alertdialog', { name: 'Delete board' })
  await expect(dialog).toContainText('Evening Review')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(() => closed).toBe(true)
  expect(simulator.db.workspaces.some((w) => w.id === board.id)).toBe(true)
})

test('the New board dialog opens with the Name field focused', async ({ mount, page, simulator: _backend }) => {
  await mount(
    <ShellProviders>
      <CreateWorkspaceDialog open onClose={() => {}} />
    </ShellProviders>,
  )
  const dialog = page.getByRole('dialog', { name: 'New board' })
  await expect(dialog.getByLabel('Name')).toBeFocused()
})
