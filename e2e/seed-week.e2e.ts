import { test, expect } from '@playwright/test'
import { CalendarPom, CreateWorkspaceDialogPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { priyaWeek } from './seed-week'

/**
 * Demo step 1 (plans/student-planning-demo.md): on a new empty board, add
 * Calendar, To-do and Coming up with a click each, and see Priya's seeded
 * week (e2e/seed-week.ts), which a reseed builds around today.
 */
// Seed and browser share one frozen "now", so the journey checks the same
// day whenever it runs.
const DAYS = [
  // A typical demo day: this week's quiz (Thu, so "Tomorrow") and lab report (Fri) are ahead.
  { name: 'Wednesday', now: '2026-10-28T09:00:00Z', quiz: 'Tomorrow', labReport: 'Fri 30 Oct' },
  // Both have passed: they roll forward to next week, still within Coming up's 14 days.
  { name: 'Saturday', now: '2026-10-31T10:00:00Z', quiz: 'Thu 5 Nov', labReport: 'Fri 6 Nov' },
]

test.describe("Priya's seeded week", () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test.afterAll(async () => { await reseed() })

  for (const day of DAYS) {
    test(`on a ${day.name}, a new board with Calendar, To-do and Coming up shows the week`, async ({ page }) => {
      const now = Date.parse(day.now)
      await reseed({ now })
      await page.clock.setFixedTime(now)

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

      // Lectures and two cafe shifts, fixed, in the week of 26 Oct.
      const calendar = new CalendarPom(page)
      await expect(calendar.root.getByText('26 Oct - 1 Nov 2026')).toBeVisible({ timeout: 10000 })
      await expect(calendar.block('Biology lecture')).toHaveCount(2)
      await expect(calendar.block('Chemistry lecture')).toHaveCount(1)
      await expect(calendar.block('Cafe shift')).toHaveCount(2)
      await expect(calendar.block('Cafe shift').last()).toHaveAttribute('aria-label', /17:00 - 22:00/)

      // The quiz and lab report are always ahead, under their own days.
      const comingUp = grid.panelByLabel('Coming up')
      await expect(comingUp.getByText(day.quiz)).toBeVisible()
      await expect(comingUp.getByText(day.labReport)).toBeVisible()
      await expect(comingUp.getByText('Biology quiz')).toBeVisible()
      await expect(comingUp.getByText('Chemistry lab report')).toBeVisible()
      await expect(comingUp.getByText(/Still to do from earlier/)).toHaveCount(0)

      const todo = grid.panelByLabel('To-do')
      // Six to plan, two from yesterday that didn't happen, and the study already planned (sized at reseed).
      await expect(todo.getByTestId('todo-item')).toHaveCount(priyaWeek(now).filter((i) => i.kind === 'task').length)
      await expect(todo.getByTestId('todo-item').filter({ hasText: 'Lab report write-up' })).toBeVisible()
      // Yesterday's two blocks, said gently; nothing else is behind.
      await expect(todo.getByText('Still to do from yesterday')).toHaveCount(2)
    })
  }
})
