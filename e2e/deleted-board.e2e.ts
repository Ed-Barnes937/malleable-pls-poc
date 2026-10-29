import { test, expect, type Page } from '@playwright/test'
import { TopBarPom, CreateWorkspaceDialogPom, DeleteWorkspaceDialogPom, PanelGridPom, SidebarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'

/** Deletes a board from its tab and waits for the tab to go. */
async function deleteBoard(page: Page, name: string) {
  const topBar = new TopBarPom(page)
  await topBar.deleteWorkspace(name)
  await new DeleteWorkspaceDialogPom(page).confirm()
  await expect(topBar.workspaceTab(name)).toHaveCount(0)
}

// The app used to reopen on the seeded "In Lecture" board whether or not the
// student still had it. Once it was deleted, a reload left no tab open and
// the empty-board starters up, and every widget added went to the deleted
// board ("Couldn't add Calendar. Try again.").
test.describe('Reloading after deleting a board', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('opens a board the student has, and a widget added from the menu lands on it', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await deleteBoard(page, 'In Lecture')

    await page.reload()
    // The first board in tab order.
    await expect(topBar.workspaceTabs.first()).toHaveText('Evening Review')
    await topBar.expectActiveWorkspace('Evening Review')
    await grid.expectPanelCount(4)

    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Calendar')
    await expect(page.getByTestId('toast-host')).toContainText('Calendar added')
    await expect(grid.panelByLabel('Calendar')).toHaveCount(1)
    await grid.expectPanelCount(5)
  })

  test('opens a board the student has, and a starter adds its widgets to it', async ({ page, request }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')
    await deleteBoard(page, 'In Lecture')
    // Arrange: the new, empty board first in tab order, so it opens on reload.
    const boards = await trpcQuery<{ id: string; name: string }[]>(request, 'workspaces.list')
    const myWeek = boards.find((b) => b.name === 'My week')!.id
    await trpcMutation(request, 'workspaces.reorder', [myWeek, ...boards.map((b) => b.id).filter((id) => id !== myWeek)])

    await page.reload()
    await expect(topBar.workspaceTabs.first()).toHaveText('My week')
    await topBar.expectActiveWorkspace('My week')
    await grid.expectEmpty()

    await grid.starter('Plan my time').click()
    await expect(page.getByTestId('toast-host')).toContainText('Calendar, To-do and Coming up added')
    await expect(grid.panelByLabel('Calendar')).toHaveCount(1)
    await grid.expectPanelCount(3)
  })

  test('with every board deleted, offers a new board instead of widgets, and the new board takes one', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    for (const name of ['In Lecture', 'Evening Review', 'Exam Prep']) await deleteBoard(page, name)
    await expect(topBar.workspaceTabs).toHaveCount(0)

    await page.reload()
    await expect(grid.noBoards).toBeVisible()
    await expect(grid.noBoards.getByRole('heading', { name: 'You don\'t have any boards.' })).toBeVisible()
    await expect(topBar.workspaceTabs).toHaveCount(0)
    await expect(grid.emptyState).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Plan my time: add / })).toHaveCount(0)
    // Nothing to add widgets to from the menu either.
    await topBar.openDrawer()
    await expect(page.getByTestId('widget-palette')).toHaveCount(0)
    await expect(page.getByTestId('drawer-sidebar')).toContainText('Make a board first, then you can add widgets to it.')
    await page.getByRole('button', { name: 'Close board menu' }).click()

    await grid.noBoards.getByRole('button', { name: 'New board' }).click()
    await new CreateWorkspaceDialogPom(page).createWorkspace('Fresh start')
    await topBar.expectActiveWorkspace('Fresh start')
    await expect(grid.noBoards).toHaveCount(0)
    await grid.expectEmpty()

    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Calendar')
    await expect(page.getByTestId('toast-host')).toContainText('Calendar added')
    await expect(grid.panelByLabel('Calendar')).toHaveCount(1)
    await grid.expectPanelCount(1)
  })
})
