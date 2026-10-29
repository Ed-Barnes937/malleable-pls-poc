import { test, expect } from '@playwright/test'
import { CreateWorkspaceDialogPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { apiUrl } from './ports'

/**
 * The Scope section offers a picker for every dimension some widget on the
 * board uses, per each manifest's `scope` declaration.
 *
 * In Lecture: audio-capture files new lectures under the course (`label`)
 * and both widgets target the focused recording, so it shows Course and
 * Recording.
 *
 * Exam Prep: gap-analysis, weakest-topics and test-me use the course but
 * ignore the focused recording, so it shows Course only.
 */

test.describe('Scope pickers', () => {
  test.afterAll(async () => { await reseed() })

  test('In Lecture shows the Course and Recording pickers', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('In Lecture')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.scopeSection).toBeVisible()
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
    await expect(sidebar.courseSelect).toBeVisible()
  })

  test('at 1440x900 the Showing pickers are in view as the board menu opens, before the widget palette', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('In Lecture')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
    // No scrolling the menu to find them.
    await expect(sidebar.courseSelect).toBeInViewport({ ratio: 1 })
    await expect(sidebar.recordingSelect).toBeInViewport({ ratio: 1 })
    const showing = (await sidebar.scopeSection.boundingBox())!
    const palette = (await sidebar.root.getByTestId('widget-palette').boundingBox())!
    expect(showing.y + showing.height).toBeLessThanOrEqual(palette.y)
  })

  test('on a board just built from the menu, reopening it shows Course straight away (demo steps 1 and 3)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    // Adding the first widget brings Showing in above the palette.
    for (const label of ['Calendar', 'To-do', 'Coming up']) await sidebar.addWidget(label)
    await expect(sidebar.courseSelect).toBeAttached()
    await page.keyboard.press('Escape')

    await topBar.openDrawer()
    await expect(sidebar.courseSelect).toBeInViewport({ ratio: 1 })
  })

  test('Exam Prep shows only the Course picker', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.courseSelect).toBeVisible()
    await expect(sidebar.recordingSelect).toHaveCount(0)
  })

  test('changing course clears a focus outside it and keeps one inside it', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })

    // "All courses" still contains the focused biology lecture.
    await sidebar.selectCourse('All courses')
    await expect(sidebar.courseSelect).toHaveValue('', { timeout: 10000 })
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4')

    // The focused biology lecture is not in Chemistry - the server clears it.
    await sidebar.selectCourse('Chemistry')
    await expect(sidebar.courseSelect).toHaveValue('chemistry', { timeout: 10000 })
    await expect(sidebar.recordingSelect).toHaveValue('', { timeout: 10000 })
  })

  test('changing course persists across reload', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await sidebar.selectCourse('Chemistry')
    await expect(sidebar.courseSelect).toHaveValue('chemistry', { timeout: 10000 })

    await page.reload()
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.openDrawer()
    await expect(sidebar.courseSelect).toHaveValue('chemistry', { timeout: 10000 })
  })
})

test.describe('Course scope filters every widget', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a Biology Exam Prep board shows only Biology and highlights it in All Courses', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Exam Prep')

    const weakest = grid.panelByLabel('Weakest Topics')
    const testMe = grid.panelByLabel('Test Me')
    const allCourses = grid.panelByLabel('All Courses')

    // Unscoped: every course is present and nothing is highlighted.
    await expect(weakest.getByText('chemistry').first()).toBeVisible({ timeout: 10000 })
    await expect(testMe.getByText('1/15')).toBeVisible()
    await expect(allCourses.locator('[data-highlighted]')).toHaveCount(0)

    await topBar.openDrawer()
    await new SidebarPom(page).selectCourse('Biology')
    await page.keyboard.press('Escape')
    await expect(topBar.scopeChip).toHaveText('Showing: Biology')

    // Filtered widgets show only Biology and say what they leave out.
    // No course pills on a course board: Chemistry's lecture is simply gone.
    await expect(weakest.getByText(/Organic Reactions/)).toHaveCount(0, { timeout: 10000 })
    await expect(weakest.getByTestId('weak-topic')).toHaveCount(5)
    await expect(weakest.getByText('+1 in other courses')).toBeVisible()
    await expect(testMe.getByText('1/13')).toBeVisible()
    await expect(testMe.getByText('+2 in other courses')).toBeVisible()

    // All Courses highlights Biology and still shows Chemistry.
    await expect(allCourses.locator('[data-course="biology"]')).toHaveAttribute('data-highlighted', 'true')
    await expect(allCourses.locator('[data-course="chemistry"]')).toBeVisible()
    await expect(allCourses.locator('[data-course="chemistry"]')).not.toHaveAttribute('data-highlighted')
  })

  test('the Biology Evening Review board filters Your Progress and follows its lecture', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')

    const thisWeek = grid.panelByLabel('Your Progress')
    await expect(thisWeek.getByText('biology')).toBeVisible({ timeout: 10000 })
    await expect(thisWeek.getByText('chemistry')).toHaveCount(0)
    await expect(thisWeek.getByText('+1 in other courses')).toBeVisible()
    await expect(grid.panelByLabel('Connections').getByText(/Same concept|Builds on|Related|References/).first()).toBeVisible()
    await expect(grid.panelByLabel('Transcript').getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()

    // Clearing the course brings the other courses back.
    await topBar.openDrawer()
    await new SidebarPom(page).selectCourse('All courses')
    await page.keyboard.press('Escape')
    await expect(thisWeek.getByText('chemistry')).toBeVisible({ timeout: 10000 })
    await expect(thisWeek.getByText('+1 in other courses')).toHaveCount(0)
  })

  test('a lecture focused outside the board course wins: its title shows and tagging it works', async ({ page, request }) => {
    // Biology board, Chemistry lecture focused (e.g. uploaded and filed under
    // Chemistry while on the board). Set the focus directly, as the upload does.
    const res = await request.post(`${apiUrl}/workspaces.setScope`, {
      headers: { 'x-user-id': 'dev-user-1' },
      data: { json: { workspaceId: 'ws-evening-review', scopeType: 'recording', scopeValue: 'rec-chem-1' } },
    })
    expect(res.ok()).toBe(true)

    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await expect(topBar.scopeChip).toHaveText('Showing: Biology · Chemistry Lecture: Organic Reactions', { timeout: 10000 })

    const transcript = grid.panelByLabel('Transcript')
    await expect(transcript.getByText('SN1 vs SN2 still confusing')).toBeVisible({ timeout: 10000 })
    await transcript.getByText(/Good afternoon. Today we begin organic reactions/).click()
    const confusedButton = transcript.getByRole('button', { name: 'confused', exact: true })
    await expect(confusedButton).toBeVisible()
    const before = await transcript.locator('text=confused').count()
    await confusedButton.click()
    await expect(transcript.locator('text=confused')).toHaveCount(before + 1, { timeout: 10000 })

    await topBar.openDrawer()
    await expect(new SidebarPom(page).recordingSelect).toHaveValue('rec-chem-1')
  })
})
