import { test, expect, type Page } from '@playwright/test'
import { TopBarPom, CreateWorkspaceDialogPom, PanelGridPom } from './pom'
import { reseed } from './reseed'

type Box = { x: number; y: number; width: number; height: number }

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** Tuesday 27 Oct 2026, 09:00 in London (GMT): Chemistry 14:00, a shift 17:00-22:00, no study planned yet. */
const TUESDAY = new Date('2026-10-27T09:00:00Z')
/** Saturday 31 Oct 2026, 09:00 in London: no class or shift. */
const SATURDAY = new Date('2026-10-31T09:00:00Z')

async function newBoard(page: Page, name = 'My week') {
  const topBar = new TopBarPom(page)
  const grid = new PanelGridPom(page)
  if (page.url() === 'about:blank') await page.goto('/')
  await topBar.openCreateWorkspaceDialog()
  await new CreateWorkspaceDialogPom(page).createWorkspace(name)
  await topBar.expectActiveWorkspace(name)
  await grid.expectEmpty()
  return { topBar, grid }
}

/**
 * Where a panel sits in the viewport once settled: its layout (the style the
 * canvas sets, not mid-animation geometry) offset by the canvas's position.
 */
async function box(grid: PanelGridPom, label: string): Promise<Box> {
  const canvas = await grid.root.boundingBox()
  if (!canvas) throw new Error('no canvas')
  const layout = await grid.panelByLabel(label).evaluate((el: HTMLElement) => ({
    x: parseFloat(el.style.left), y: parseFloat(el.style.top),
    width: parseFloat(el.style.width), height: parseFloat(el.style.height),
  }))
  return { ...layout, x: canvas.x + layout.x, y: canvas.y + layout.y }
}

test.describe('First run on an empty board', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async () => { await reseed() })

  test('"Plan my time" adds Calendar, To-do and Coming up, laid out side by side in view', async ({ page }) => {
    const { grid } = await newBoard(page)
    await expect(grid.emptyState.getByRole('heading', { name: 'This board is yours to build.' })).toBeVisible()
    await expect(grid.emptyState.getByRole('button', { name: 'Add widgets' })).toBeVisible()

    await grid.starter('Plan my time').click()
    await grid.expectPanelCount(3)
    for (const label of ['Calendar', 'To-do', 'Coming up']) await grid.expectHasPanel(label)
    await expect(grid.emptyState).toBeHidden()
    await expect(page.getByTestId('toast-host')).toContainText('Calendar, To-do and Coming up added')

    // Calendar on the left; To-do and Coming up stacked in the column beside it.
    const calendar = await box(grid, 'Calendar')
    const todo = await box(grid, 'To-do')
    const comingUp = await box(grid, 'Coming up')
    expect(todo.x).toBeGreaterThan(calendar.x + calendar.width)
    expect(comingUp.x).toBe(todo.x)
    expect(comingUp.y).toBeGreaterThan(todo.y + todo.height)
    for (const [a, b] of [[calendar, todo], [calendar, comingUp], [todo, comingUp]]) expect(overlaps(a, b)).toBe(false)
    // Nothing starts off-screen on a laptop.
    for (const b of [calendar, todo, comingUp]) {
      expect(b.x + b.width).toBeLessThanOrEqual(1440)
      expect(b.y + b.height).toBeLessThanOrEqual(900)
    }
  })

  test('"Capture a lecture" and "Find what to revise" add their widgets and nothing else', async ({ page }) => {
    const { grid } = await newBoard(page)
    await grid.starter('Capture a lecture').click()
    await grid.expectPanelCount(2)
    await grid.expectHasPanel('Audio Capture')
    await grid.expectHasPanel('Transcript')

    await newBoard(page, 'Revision')
    await grid.starter('Find what to revise').click()
    await grid.expectPanelCount(2)
    await grid.expectHasPanel('Weakest Topics')
    await grid.expectHasPanel('Your Progress')
  })

  test('"Add widgets" still opens the widget palette', async ({ page }) => {
    const { grid } = await newBoard(page)
    await grid.emptyState.getByRole('button', { name: 'Add widgets' }).click()
    await expect(page.getByTestId('drawer-sidebar')).toBeInViewport()
  })
})

test.describe('The today line', () => {
  test.afterAll(async () => { await reseed() })

  test('sums up today from the plan: classes, shifts and study time left', async ({ page }) => {
    await reseed({ now: TUESDAY })
    await page.clock.setFixedTime(TUESDAY)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await expect(topBar.todayLine).toBeVisible()
    await expect(topBar.todayLine).toHaveAttribute('title', 'Tuesday · Chemistry 14:00 · shift 17:00-22:00 · 2h to study')

    // Narrow: the top bar has no room, so the line steps aside.
    await page.setViewportSize({ width: 400, height: 860 })
    await expect(topBar.todayLine).toBeHidden()
  })

  test('steps aside rather than cutting off when the board tabs fill the bar', async ({ page }) => {
    await reseed({ now: TUESDAY })
    await page.clock.setFixedTime(TUESDAY)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await expect(topBar.todayLine).toBeVisible()
    for (const name of ['Biology revision', 'Chemistry lab week']) {
      await topBar.openCreateWorkspaceDialog()
      await new CreateWorkspaceDialogPom(page).createWorkspace(name)
      await topBar.expectActiveWorkspace(name)
    }
    await expect(topBar.todayLine).toBeHidden()
    // Room again: it comes back whole.
    await page.setViewportSize({ width: 1920, height: 900 })
    await expect(topBar.todayLine).toBeVisible()
  })

  test('stays out of the way on a day with no class or shift', async ({ page }) => {
    await reseed({ now: SATURDAY })
    await page.clock.setFixedTime(SATURDAY)
    await page.setViewportSize({ width: 1440, height: 900 })
    // Wait for today's plan items before checking an absence.
    const loaded = page.waitForResponse((r) => r.url().includes('planItems.list') && r.ok())
    await page.goto('/')
    await loaded
    await expect(new TopBarPom(page).root).toBeVisible()
    await expect(new TopBarPom(page).todayLine).toHaveCount(0)
  })
})
