import { test, expect } from '@playwright/test'
import { TopBarPom, CreateWorkspaceDialogPom, DeleteWorkspaceDialogPom, PanelGridPom } from './pom'
import { reseed } from './reseed'

test.describe('Workspace management', () => {
  test.beforeAll(async () => { await reseed() })
  test('switching workspaces shows different panels', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Default workspace is Evening Review with 4 panels
    await topBar.expectActiveWorkspace('Evening Review')
    await grid.expectPanelCount(4)
    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('Test Me')

    // Switch to In Lecture — 2 panels
    await topBar.switchToWorkspace('In Lecture')
    await topBar.expectActiveWorkspace('In Lecture')
    await grid.expectPanelCount(2)
    await grid.expectHasPanel('Audio Capture')
    await grid.expectHasPanel('Transcript')

    // Switch to Exam Prep — 3 panels
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.expectActiveWorkspace('Exam Prep')
    await grid.expectPanelCount(3)
    await grid.expectHasPanel('All Courses')
    await grid.expectHasPanel('Weakest Topics')
    await grid.expectHasPanel('Test Me')
  })

  test('creating a new workspace via the dialog', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)

    await topBar.openCreateWorkspaceDialog()
    await dialog.expectCreateDisabled()

    await dialog.createWorkspace('Study Session')

    // Dialog should close and the new workspace should be active
    await expect(dialog.root).toBeHidden()
    await topBar.expectActiveWorkspace('Study Session')
  })

  test('new workspace starts empty with drop zone', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)
    const grid = new PanelGridPom(page)

    await topBar.openCreateWorkspaceDialog()
    await dialog.createWorkspace('Empty Workspace')

    await expect(dialog.root).toBeHidden()
    await topBar.expectActiveWorkspace('Empty Workspace')
    await grid.expectEmpty()
  })

  test('deleting a workspace removes it from the sidebar', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)
    const deleteDialog = new DeleteWorkspaceDialogPom(page)

    // Create a workspace to delete
    await topBar.openCreateWorkspaceDialog()
    await dialog.createWorkspace('Temp Workspace')
    await expect(dialog.root).toBeHidden()
    await topBar.expectActiveWorkspace('Temp Workspace')

    // Count workspaces before delete
    const countBefore = await topBar.workspaceTabs.count()

    // Click the trash icon
    await topBar.deleteWorkspace('Temp Workspace')

    // Confirmation dialog should appear
    await expect(deleteDialog.root).toBeVisible()
    await expect(deleteDialog.root.getByText('Temp Workspace')).toBeVisible()

    // Confirm deletion
    await deleteDialog.confirm()

    // Dialog closes and workspace is gone
    await expect(deleteDialog.root).toBeHidden()
    await expect(topBar.workspaceTabs).toHaveCount(countBefore - 1)
    await expect(topBar.root.getByRole('button', { name: 'Temp Workspace' })).toBeHidden()
  })

  test('cancelling workspace deletion keeps it', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const deleteDialog = new DeleteWorkspaceDialogPom(page)

    await expect(topBar.newWorkspaceButton).toBeVisible({ timeout: 10000 })
    const countBefore = await topBar.workspaceTabs.count()

    // Try to delete Evening Review but cancel
    await topBar.deleteWorkspace('Evening Review')
    await expect(deleteDialog.root).toBeVisible()
    await deleteDialog.cancel()

    await expect(deleteDialog.root).toBeHidden()
    await expect(topBar.workspaceTabs).toHaveCount(countBefore)
    await topBar.expectActiveWorkspace('Evening Review')
  })

  test('cancelling workspace creation does not create one', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)

    // Wait for workspaces to load, then count
    await expect(topBar.newWorkspaceButton).toBeVisible({ timeout: 10000 })
    const countBefore = await topBar.workspaceTabs.count()

    await topBar.openCreateWorkspaceDialog()
    await dialog.fillName('Should Not Exist')
    await dialog.cancel()

    await expect(dialog.root).toBeHidden()

    // Workspace count should be the same
    await expect(topBar.workspaceTabs).toHaveCount(countBefore)

    // The workspace name should not appear in the topbar
    await expect(topBar.root.getByRole('button', { name: 'Should Not Exist' })).toBeHidden()
  })
})
