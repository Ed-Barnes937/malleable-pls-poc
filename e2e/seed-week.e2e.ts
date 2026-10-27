import { test, expect } from '@playwright/test'
import { CalendarPom, CreateWorkspaceDialogPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { reseed } from './reseed'

/**
 * Demo step 1 (plans/student-planning-demo.md): on a new empty board, add
 * Calendar, To-do and Coming up with a click each, and see Priya's seeded
 * week (e2e/seed-week.ts), which a reseed builds around today.
 */
test.describe("Priya's seeded week", () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a new board with Calendar, To-do and Coming up shows this week', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')
    await grid.expectEmpty()

    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    for (const label of ['Calendar', 'To-do', 'Coming up']) await sidebar.addWidget(label)
    await page.keyboard.press('Escape')

    // Lectures and two cafe shifts, fixed, every week of term.
    const calendar = new CalendarPom(page)
    await expect(calendar.block('Biology lecture')).toHaveCount(2, { timeout: 10000 })
    await expect(calendar.block('Chemistry lecture')).toHaveCount(1)
    await expect(calendar.block('Cafe shift')).toHaveCount(2)
    await expect(calendar.block('Cafe shift').last()).toHaveAttribute('aria-label', /17:00 - 22:00/)

    const comingUp = grid.panelByLabel('Coming up')
    await expect(comingUp.getByText('Biology quiz')).toBeVisible()
    await expect(comingUp.getByText('Chemistry lab report')).toBeVisible()

    const todo = grid.panelByLabel('To-do')
    await expect(todo.getByTestId('todo-item')).toHaveCount(4)
    await expect(todo.getByTestId('todo-item').filter({ hasText: 'Lab report write-up' })).toBeVisible()
  })
})
