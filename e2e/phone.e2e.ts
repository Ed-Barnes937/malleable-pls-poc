import { test, expect, type APIRequestContext } from '@playwright/test'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation } from './api'

/**
 * On a phone (400px wide): the Calendar opens on today in Day view and steps
 * a day at a time, the board tabs scroll with the open board in view, and a
 * ticked to-do says "Done · Undo" in place before it moves to Done today.
 * Runs on the real clock: Priya's seeded week is built around now.
 */

async function myWeekBoard(request: APIRequestContext) {
  const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'My week' })
  let y = 24
  for (const lensType of ['calendar', 'todo']) {
    await trpcMutation(request, 'workspaces.addPanel', {
      workspaceId: board.id, lensType, slotName: lensType, pos_x: 24, pos_y: y, width: 900, height: 640,
    })
    y += 664
  }
}

const fullDay = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(d).replace(',', '')
const dayFrom = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

test.describe('Phone', () => {
  test.use({ viewport: { width: 400, height: 860 } })
  test.beforeEach(async ({ request, page }) => {
    await reseed()
    await myWeekBoard(request)
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
  })
  test.afterAll(async () => { await reseed() })

  test('the Calendar opens on today in Day view and steps a day at a time', async ({ page }) => {
    const calendar = new CalendarPom(page)
    await expect(calendar.root.getByRole('tab', { name: 'Day' })).toHaveAttribute('aria-selected', 'true')
    await expect(calendar.days).toHaveCount(1)
    await expect(calendar.root.getByTestId('calendar-title')).toHaveText(fullDay(new Date()))
    await expect(calendar.root.getByText('Today', { exact: true })).toBeVisible()

    await calendar.root.getByRole('button', { name: 'Next day' }).click()
    await expect(calendar.root.getByTestId('calendar-title')).toHaveText(fullDay(dayFrom(1)))
    await calendar.root.getByRole('button', { name: 'Previous day' }).click()
    await calendar.root.getByRole('button', { name: 'Previous day' }).click()
    await expect(calendar.root.getByTestId('calendar-title')).toHaveText(fullDay(dayFrom(-1)))
    await calendar.root.getByRole('button', { name: 'Back to today' }).click()
    await expect(calendar.root.getByTestId('calendar-title')).toHaveText(fullDay(new Date()))

    // The board tabs scroll sideways: the open board (the newest, last) is in
    // view and the edge with boards past it fades.
    const strip = page.getByRole('group', { name: 'Boards' })
    await expect(strip).toHaveAttribute('data-fade-start', 'true')
    const tab = strip.getByRole('button', { name: 'My week', exact: true })
    const [s, t] = [await strip.boundingBox(), await tab.boundingBox()]
    expect(t!.x).toBeGreaterThanOrEqual(s!.x)
    expect(t!.x + t!.width).toBeLessThanOrEqual(s!.x + s!.width)

    // Day view on the phone is not saved: a wide screen still opens on the week.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(calendar.days).toHaveCount(7)
  })

  test('a ticked to-do says Done · Undo in place, Undo reopens it, and left alone it moves to Done today', async ({ page }) => {
    const todo = new PanelGridPom(page).panelByLabel('To-do')
    const title = 'Make flashcards: cell structure'
    const row = todo.getByTestId('todo-item').filter({ hasText: title })

    await row.getByRole('checkbox', { name: `Done: ${title}` }).click()
    await expect(row).toHaveAttribute('data-just-done', 'shown')
    await expect(row.getByText(title)).toHaveCSS('text-decoration-line', 'line-through')
    await expect(row.getByText('Done', { exact: true })).toBeVisible()
    await expect(todo.getByText('Done today')).toHaveCount(0)

    // Undo: open again, and it stays open after a reload.
    await row.getByRole('button', { name: `Undo: ${title}` }).click()
    await expect(row.getByRole('checkbox', { name: `Done: ${title}` })).toHaveAttribute('aria-checked', 'false')
    await expect(row).not.toHaveAttribute('data-just-done')
    await page.reload()
    await new TopBarPom(page).switchToWorkspace('My week')
    await expect(row.getByRole('checkbox', { name: `Done: ${title}` })).toHaveAttribute('aria-checked', 'false', { timeout: 10000 })
    await expect(todo.getByText('Done today')).toHaveCount(0)

    // Left alone, it fades and moves down to Done today.
    await row.getByRole('checkbox', { name: `Done: ${title}` }).click()
    await expect(row).toHaveAttribute('data-just-done', 'shown')
    await expect(todo.getByText('Done today')).toBeVisible({ timeout: 10000 })
    await expect(row.getByRole('checkbox', { name: `Not done yet: ${title}` })).toHaveAttribute('aria-checked', 'true')
    await expect(row.getByRole('button', { name: `Undo: ${title}` })).toHaveCount(0)
  })
})
