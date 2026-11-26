import { test, expect } from './test'
import { TopBarPom, CreateWorkspaceDialogPom, DeleteWorkspaceDialogPom, PanelGridPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'

// The app used to reopen on the first board in tab order whichever board the
// student had open. It now reopens on the one they last had open on this
// device. Playwright gives each test a fresh browser context, so the
// remembered board never leaks between tests.
test.describe('Reopening the board the student last had open', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a first visit opens the first board in tab order', async ({ page }) => {
    const topBar = new TopBarPom(page)
    await page.goto('/')
    await expect(topBar.workspaceTabs.first()).toHaveText('Evening Review')
    await topBar.expectActiveWorkspace('Evening Review')
  })

  test('a reload stays on the board that was open', async ({ page }) => {
    const topBar = new TopBarPom(page)
    await page.goto('/')
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.expectActiveWorkspace('Exam Prep')

    await page.reload()
    await topBar.expectActiveWorkspace('Exam Prep')
    // Not just the tab: the board's own widgets are the ones on screen.
    await new PanelGridPom(page).expectPanelCount(3)
  })

  test('a new board opens again after a reload, and a later switch is remembered instead', async ({ page }) => {
    const topBar = new TopBarPom(page)
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')

    await page.reload()
    await topBar.expectActiveWorkspace('My week')

    await topBar.switchToWorkspace('In Lecture')
    await page.reload()
    await topBar.expectActiveWorkspace('In Lecture')
  })

  test('a board deleted here: the next reload opens the default board, with no error', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')
    await topBar.deleteWorkspace('My week')
    await new DeleteWorkspaceDialogPom(page).confirm()
    await expect(topBar.workspaceTab('My week')).toHaveCount(0)

    await page.reload()
    await expect(topBar.workspaceTab('My week')).toHaveCount(0)
    await topBar.expectActiveWorkspace('Evening Review')
    // Settled: the board's widgets are up, so a late toast would have shown by now.
    await new PanelGridPom(page).expectPanelCount(4)
    await expect(page.getByTestId('toast-host')).not.toContainText(/couldn't|try again/i)
    expect(errors).toEqual([])
  })

  test('a remembered board deleted elsewhere: the reload opens the default board, with no error', async ({ page, request }) => {
    const topBar = new TopBarPom(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.expectActiveWorkspace('Exam Prep')
    // Deleted behind this browser's back: its id is still the remembered one.
    const boards = await trpcQuery<{ id: string; name: string }[]>(request, 'workspaces.list')
    await trpcMutation(request, 'workspaces.delete', boards.find((b) => b.name === 'Exam Prep')!.id)

    await page.reload()
    await expect(topBar.workspaceTab('Exam Prep')).toHaveCount(0)
    await topBar.expectActiveWorkspace('Evening Review')
    await new PanelGridPom(page).expectPanelCount(4)
    await expect(page.getByTestId('toast-host')).not.toContainText(/couldn't|try again/i)
    expect(errors).toEqual([])
  })
})
