import { test, expect } from './test'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'

/**
 * The seeded student has a fourth board, Weekly plan: the "Plan my time"
 * starter's widgets (Calendar, To-do, Coming up), laid out as that starter
 * lays them out at 1440x900, for all courses (see 027_seed_weekly_plan_board.sql).
 */
// Seed and browser share one frozen "now", so the week checked is the same whenever this runs.
const NOW = Date.parse('2026-10-28T09:00:00Z')

test.describe('The Weekly plan board in the seed', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async () => {
    await reseed({ now: NOW })
  })
  test.afterAll(async () => { await reseed() })

  test('is the last tab and shows Calendar, To-do and Coming up with the seeded week', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await expect(topBar.workspaceTabs).toHaveText(['Evening Review', 'Exam Prep', 'In Lecture', 'Weekly plan'])

    await topBar.switchToWorkspace('Weekly plan')
    await topBar.expectActiveWorkspace('Weekly plan')
    await grid.expectPanelCount(3)
    for (const label of ['Calendar', 'To-do', 'Coming up']) await grid.expectHasPanel(label)

    // All courses: Priya's week, the same one a new Plan my time board shows.
    const calendar = new CalendarPom(page)
    await expect(calendar.root.getByText('26 Oct - 1 Nov 2026')).toBeVisible({ timeout: 10000 })
    await expect(calendar.block('Biology lecture')).toHaveCount(2)
    await expect(calendar.block('Chemistry lecture')).toHaveCount(1)
    await expect(calendar.block('Cafe shift')).toHaveCount(2)
  })

  test('lays the widgets out as the Plan my time starter does at 1440x900', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await topBar.switchToWorkspace('Weekly plan')
    await grid.expectPanelCount(3)
    const layout = (label: string) => grid.panelByLabel(label).evaluate((el: HTMLElement) => ({
      x: parseFloat(el.style.left), y: parseFloat(el.style.top),
      width: parseFloat(el.style.width), height: parseFloat(el.style.height),
    }))
    expect(await layout('Calendar')).toEqual({ x: 20, y: 20, width: 900, height: 731 })
    expect(await layout('To-do')).toEqual({ x: 940, y: 20, width: 360, height: 411 })
    expect(await layout('Coming up')).toEqual({ x: 940, y: 451, width: 360, height: 299 })
  })
})
