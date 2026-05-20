import { test, expect } from '@playwright/test'
import { SidebarPom, CreateWorkspaceDialogPom, DeleteWorkspaceDialogPom, PanelGridPom } from './pom'
import { reseed } from './reseed'

test.describe('Workspace management', () => {
  test.beforeAll(async () => { await reseed() })
  test('switching workspaces shows different panels', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const grid = new PanelGridPom(page)

    // Default workspace is Evening Review with 4 panels
    await sidebar.expectActiveWorkspace('Evening Review')
    await grid.expectPanelCount(4)
    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('Test Me')

    // Switch to In Lecture — 2 panels
    await sidebar.switchToWorkspace('In Lecture')
    await sidebar.expectActiveWorkspace('In Lecture')
    await grid.expectPanelCount(2)
    await grid.expectHasPanel('Audio Capture')
    await grid.expectHasPanel('Transcript')

    // Switch to Exam Prep — 3 panels
    await sidebar.switchToWorkspace('Exam Prep')
    await sidebar.expectActiveWorkspace('Exam Prep')
    await grid.expectPanelCount(3)
    await grid.expectHasPanel('All Courses')
    await grid.expectHasPanel('Weakest Topics')
    await grid.expectHasPanel('Test Me')
  })

  test('creating a new workspace via the dialog', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)

    await sidebar.openCreateWorkspaceDialog()
    await dialog.expectCreateDisabled()

    await dialog.createWorkspace('Study Session')

    // Dialog should close and the new workspace should be active
    await expect(dialog.root).toBeHidden()
    await sidebar.expectActiveWorkspace('Study Session')
  })

  test('new workspace starts empty with drop zone', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)
    const grid = new PanelGridPom(page)

    await sidebar.openCreateWorkspaceDialog()
    await dialog.createWorkspace('Empty Workspace')

    await expect(dialog.root).toBeHidden()
    await sidebar.expectActiveWorkspace('Empty Workspace')
    await grid.expectEmpty()
  })

  test('deleting a workspace removes it from the sidebar', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)
    const deleteDialog = new DeleteWorkspaceDialogPom(page)

    // Create a workspace to delete
    await sidebar.openCreateWorkspaceDialog()
    await dialog.createWorkspace('Temp Workspace')
    await expect(dialog.root).toBeHidden()
    await sidebar.expectActiveWorkspace('Temp Workspace')

    // Count workspaces before delete
    const countBefore = await sidebar.workspaceButtons.count()

    // Click the trash icon
    await sidebar.deleteWorkspace('Temp Workspace')

    // Confirmation dialog should appear
    await expect(deleteDialog.root).toBeVisible()
    await expect(deleteDialog.root.getByText('Temp Workspace')).toBeVisible()

    // Confirm deletion
    await deleteDialog.confirm()

    // Dialog closes and workspace is gone
    await expect(deleteDialog.root).toBeHidden()
    await expect(sidebar.workspaceButtons).toHaveCount(countBefore - 1)
    await expect(sidebar.root.getByRole('button', { name: 'Temp Workspace' })).toBeHidden()
  })

  test('cancelling workspace deletion keeps it', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const deleteDialog = new DeleteWorkspaceDialogPom(page)

    await expect(sidebar.newWorkspaceButton).toBeVisible({ timeout: 10000 })
    const countBefore = await sidebar.workspaceButtons.count()

    // Try to delete Evening Review but cancel
    await sidebar.deleteWorkspace('Evening Review')
    await expect(deleteDialog.root).toBeVisible()
    await deleteDialog.cancel()

    await expect(deleteDialog.root).toBeHidden()
    await expect(sidebar.workspaceButtons).toHaveCount(countBefore)
    await sidebar.expectActiveWorkspace('Evening Review')
  })

  test('cancelling workspace creation does not create one', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const dialog = new CreateWorkspaceDialogPom(page)

    // Wait for workspaces to load, then count
    await expect(sidebar.newWorkspaceButton).toBeVisible({ timeout: 10000 })
    const countBefore = await sidebar.workspaceButtons.count()

    await sidebar.openCreateWorkspaceDialog()
    await dialog.fillName('Should Not Exist')
    await dialog.cancel()

    await expect(dialog.root).toBeHidden()

    // Workspace count should be the same
    await expect(sidebar.workspaceButtons).toHaveCount(countBefore)

    // The workspace name should not appear in the sidebar
    await expect(sidebar.root.getByRole('button', { name: 'Should Not Exist' })).toBeHidden()
  })
})
