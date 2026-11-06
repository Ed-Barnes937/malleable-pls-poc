import { test, expect, type Page } from '@playwright/test'
import { TopBarPom, CreateWorkspaceDialogPom, PanelGridPom, SidebarPom } from './pom'
import { reseed } from './reseed'
import { expectStillAtBottomAsToastLeaves } from './toast-bar'
import { motionSettled } from './settle'

type Box = { x: number; y: number; width: number; height: number }

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

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
  // The board may still be sliding in (a new board arrives with the shared motion).
  await motionSettled(grid.root)
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

  test('the starters step aside while a widget from the palette is still saving', async ({ page }) => {
    const { topBar, grid } = await newBoard(page)
    // A slow save: the board is still empty while it is on its way.
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    await page.route('**/workspaces.addPanel**', async (route) => { await held; await route.continue() })

    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Calendar')
    await page.keyboard.press('Escape')
    // No starter to click, so no second Calendar.
    await expect(grid.emptyState).toBeHidden()
    await grid.expectPanelCount(0)

    release()
    await grid.expectPanelCount(1)
    await grid.expectHasPanel('Calendar')
    await expect(grid.emptyState).toBeHidden()
  })

  test('the "added" toast sits in a bar under the board, covering no widget, and the keyboard reaches it', async ({ page }) => {
    const { grid } = await newBoard(page)
    await grid.starter('Plan my time').click()
    await grid.expectPanelCount(3)
    const host = page.getByTestId('toast-host')
    await expect(host).toContainText('Calendar, To-do and Coming up added')
    await expect(host).toHaveAttribute('data-layout', 'bar')
    await expect(page.getByTestId('toast-announcer')).toHaveAttribute('aria-live', 'polite')
    const toast = (await host.getByTestId('toast').boundingBox())!
    const barHeight = (await host.boundingBox())!.height
    // At the right, under the board: the board ends where the bar starts.
    const board = (await grid.root.boundingBox())!
    expect(board.y + board.height).toBeLessThanOrEqual(toast.y + 1)
    expect(toast.x + toast.width).toBeGreaterThan(1440 - 40)
    expect(toast.y + toast.height).toBeLessThanOrEqual(900)
    // What shows of each widget (the board clips one that runs below its fold) stays clear of the toast.
    for (const panel of await grid.panels.all()) {
      const p = (await panel.boundingBox())!
      const bottom = Math.min(p.y + p.height, board.y + board.height)
      expect(overlaps({ ...p, height: Math.max(0, bottom - p.y) }, toast)).toBe(false)
    }
    // Reachable from the keyboard.
    const dismiss = host.getByRole('button', { name: 'Dismiss' })
    await dismiss.focus()
    await page.keyboard.press('Enter')
    await expect(host.getByTestId('toast')).toHaveCount(0)
    // With nothing to say, the bar keeps its room (decision 22): nothing on the board moves.
    expect((await host.boundingBox())!.height).toBe(barHeight)
    expect((await grid.root.boundingBox())!.height).toBe(board.height)
  })

  test('a toast leaving while the board is scrolled to its bottom moves nothing under the pointer', async ({ page }) => {
    const { topBar, grid } = await newBoard(page)
    await grid.starter('Plan my time').click()
    await grid.expectPanelCount(3)
    // Added on a full board: it lands below the others and the board scrolls down to it (the demo's step 4).
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Transcript')
    await page.keyboard.press('Escape')
    const host = page.getByTestId('toast-host')
    await expect(host).toContainText('Transcript added')
    await expectStillAtBottomAsToastLeaves(page, grid)
  })

  test('a starter that fails says so once and comes back', async ({ page }) => {
    const { grid } = await newBoard(page)
    await page.route('**/workspaces.addPanel**', (route) => route.fulfill({ status: 500, body: 'down' }))

    await grid.starter('Capture a lecture').click()
    const toasts = page.getByTestId('toast-host').getByRole('button', { name: 'Dismiss' })
    await expect(page.getByTestId('toast-host')).toContainText("Couldn't add Audio Capture and Transcript. Try again.")
    await expect(toasts).toHaveCount(1)
    await grid.expectPanelCount(0)
    // Try again: the starters are back and work once the server does.
    await page.unroute('**/workspaces.addPanel**')
    await grid.starter('Capture a lecture').click()
    await grid.expectPanelCount(2)
  })
})
