import { test, expect } from '@playwright/test'
import { PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { reseed } from './reseed'

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
    await expect(topBar.scopeChip).toHaveText('Biology')

    // Filtered widgets show only Biology and say what they leave out.
    await expect(weakest.getByText('chemistry')).toHaveCount(0, { timeout: 10000 })
    await expect(weakest.getByText('biology').first()).toBeVisible()
    await expect(weakest.getByText('+1 in other courses')).toBeVisible()
    await expect(testMe.getByText('1/13')).toBeVisible()
    await expect(testMe.getByText('+2 in other courses')).toBeVisible()

    // All Courses highlights Biology and still shows Chemistry.
    await expect(allCourses.locator('[data-course="biology"]')).toHaveAttribute('data-highlighted', 'true')
    await expect(allCourses.locator('[data-course="chemistry"]')).toBeVisible()
    await expect(allCourses.locator('[data-course="chemistry"]')).not.toHaveAttribute('data-highlighted')
  })

  test('the Biology Evening Review board filters This Week and follows its lecture', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')

    const thisWeek = grid.panelByLabel('This Week')
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
})
