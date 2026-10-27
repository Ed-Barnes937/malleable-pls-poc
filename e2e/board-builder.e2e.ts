import { test, expect, type Page } from '@playwright/test'
import { TopBarPom, SidebarPom, CreateWorkspaceDialogPom, PanelGridPom } from './pom'
import { reseed } from './reseed'

type Box = { x: number; y: number; width: number; height: number }

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function panelBoxes(page: Page): Promise<Box[]> {
  const grid = new PanelGridPom(page)
  const boxes: Box[] = []
  for (const panel of await grid.panels.all()) {
    const box = await panel.boundingBox()
    if (box) boxes.push(box)
  }
  return boxes
}

async function buildBiologyBoard(page: Page) {
  const topBar = new TopBarPom(page)
  const dialog = new CreateWorkspaceDialogPom(page)
  const sidebar = new SidebarPom(page)
  const grid = new PanelGridPom(page)

  await page.goto('/')
  await topBar.openCreateWorkspaceDialog()
  await dialog.createWorkspace('My week', 'Biology')
  await expect(dialog.root).toBeHidden()
  await topBar.expectActiveWorkspace('My week')
  await grid.expectEmpty()

  // Three widgets by clicking, with the drawer open the whole time.
  await topBar.openDrawer()
  const drawer = page.getByTestId('drawer-sidebar')
  for (const [i, label] of ['Transcript', 'Weakest Topics', 'All Courses'].entries()) {
    await sidebar.addWidget(label)
    await expect(drawer).toBeInViewport()
    await grid.expectPanelCount(i + 1)
  }
  await page.keyboard.press('Escape')
  // Closed, the drawer slides off-screen and leaves the accessibility tree.
  await expect(drawer).toHaveAttribute('aria-hidden', 'true')
  await expect(drawer).not.toBeInViewport()
  return { topBar, grid }
}

test.describe('Building a board', () => {
  // A laptop-sized board, so three default-sized widgets fit side by side.
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async () => { await reseed() })

  test('create a board with a course and add three widgets by clicking', async ({ page }) => {
    const { topBar, grid } = await buildBiologyBoard(page)

    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('Weakest Topics')
    await grid.expectHasPanel('All Courses')
    // The board's course came from the create dialog.
    await expect(topBar.scopeChip).toHaveText('Showing: Biology')

    // Click-added widgets land in free space, not on top of each other.
    const boxes = await panelBoxes(page)
    expect(boxes).toHaveLength(3)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false)
    }
  })

  test('widgets clicked in quick succession still land in free space', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')
    await grid.expectEmpty()

    // No waiting between clicks: each add is placed before the previous one is saved.
    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    for (const label of ['Calendar', 'To-do', 'Coming up']) await sidebar.addWidget(label)
    await page.keyboard.press('Escape')
    await grid.expectPanelCount(3)

    // Placement is final once saved: it survives a reload.
    for (const reload of [false, true]) {
      if (reload) {
        await page.reload()
        await topBar.switchToWorkspace('My week')
        await grid.expectPanelCount(3)
      }
      const boxes = await panelBoxes(page)
      expect(boxes).toHaveLength(3)
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `widgets ${i} and ${j} overlap`).toBe(false)
      }
    }
  })

  test('a widget added to a full board goes below the others, in view, covering nothing', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')

    // Calendar, To-do and Coming up fill the 1440x900 board; Transcript doesn't fit beside them.
    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    for (const [i, label] of ['Calendar', 'To-do', 'Coming up', 'Transcript'].entries()) {
      await sidebar.addWidget(label)
      await grid.expectPanelCount(i + 1)
    }
    await page.keyboard.press('Escape')

    const transcript = grid.panelByLabel('Transcript')
    // The board scrolled down to show it whole.
    await expect(transcript).toBeInViewport({ ratio: 1 })
    const boxes = await panelBoxes(page)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `widgets ${i} and ${j} overlap`).toBe(false)
    }
    const calendarBox = await grid.panelByLabel('Calendar').boundingBox()
    expect((await transcript.boundingBox())!.y).toBeGreaterThanOrEqual(calendarBox!.y + calendarBox!.height)

    // Nothing covers the calendar: its controls still take clicks.
    await grid.panelByLabel('Calendar').getByRole('button', { name: 'Help me plan' }).click({ trial: true })

    // Fullscreen shows the widget from the top of the board, and leaving it
    // puts the board back where it was scrolled to.
    // (The trial click above scrolled the Calendar back into view.)
    const scrollTop = () => grid.root.evaluate((el) => el.scrollTop)
    await page.waitForTimeout(500) // let any smooth scroll finish
    await grid.root.evaluate((el) => { el.scrollTop = 150 })
    await expect.poll(scrollTop).toBe(150)
    const before = 150
    await transcript.getByRole('button', { name: 'Fullscreen Transcript' }).click()
    await expect.poll(scrollTop).toBe(0)
    await page.keyboard.press('Escape')
    await expect.poll(scrollTop).toBe(before)

    // ] / [ cycle the selection and scroll the selected widget into view.
    await grid.root.evaluate((el) => { el.scrollTop = 0 })
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await expect(transcript).not.toBeInViewport({ ratio: 1 })
    await page.keyboard.press('[') // nothing selected: the last widget, Transcript
    await expect(transcript).toBeInViewport({ ratio: 1 })
    await page.keyboard.press(']') // wraps to the first, Calendar
    await expect(grid.panelByLabel('Calendar')).toBeInViewport({ ratio: 0.9 })
  })

  test('removing a widget frees its spot for the next one', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await topBar.expectActiveWorkspace('My week')

    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    await sidebar.addWidget('To-do')
    await grid.expectPanelCount(1)
    const first = await grid.panelByLabel('To-do').boundingBox()
    await page.keyboard.press('Escape')
    await grid.panelByLabel('To-do').getByRole('button', { name: 'Remove To-do from board' }).click()
    await grid.expectPanelCount(0)

    await topBar.openDrawer()
    await sidebar.addWidget('Coming up')
    await grid.expectPanelCount(1)
    const second = await grid.panelByLabel('Coming up').boundingBox()
    // Same spot (widgets scale in, so allow a few pixels of animation).
    expect(Math.abs(second!.x - first!.x)).toBeLessThan(4)
    expect(Math.abs(second!.y - first!.y)).toBeLessThan(4)
  })

  test('fullscreen sits above other widgets and does not survive a reload', async ({ page }) => {
    const { grid } = await buildBiologyBoard(page)
    const transcript = grid.panelByLabel('Transcript')
    // Saved layout size (the rendered box animates in from 95% scale).
    const savedSize = () => transcript.evaluate((el) => [(el as HTMLElement).style.width, (el as HTMLElement).style.height])
    const before = await savedSize()

    await transcript.getByRole('button', { name: 'Fullscreen Transcript' }).click()
    const zIndexes = await grid.panels.evaluateAll((els) =>
      els.map((el) => ({ title: el.querySelector('[data-testid="panel-title"]')?.textContent, z: Number(getComputedStyle(el).zIndex) })),
    )
    const top = Math.max(...zIndexes.map((p) => p.z))
    expect(zIndexes.filter((p) => p.z === top).map((p) => p.title)).toEqual(['Transcript'])

    await page.reload()
    await new TopBarPom(page).switchToWorkspace('My week')
    await grid.expectPanelCount(3)
    await expect(transcript.getByRole('button', { name: 'Fullscreen Transcript' })).toBeVisible()
    expect(await savedSize()).toEqual(before)
  })

  test('Tab moves focus through the top bar and board menu on a board with widgets', async ({ page }) => {
    const { topBar } = await buildBiologyBoard(page)

    // Top bar: Tab moves between board tabs instead of cycling widgets.
    const firstTab = topBar.root.getByRole('button', { name: 'Evening Review', exact: true })
    await firstTab.focus()
    await page.keyboard.press('Tab')
    await expect(topBar.root.getByRole('button', { name: 'Exam Prep', exact: true })).toBeFocused()

    // Board menu: Tab reaches its controls, including widget tiles.
    await topBar.drawerTrigger.click()
    const drawer = page.getByTestId('drawer-sidebar')
    await expect(drawer).toBeInViewport()
    await page.keyboard.press('Tab')
    await expect(drawer.getByRole('button', { name: 'Close board menu' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(drawer.getByRole('button', { name: 'Add Audio Capture' })).toBeFocused()

    // Escape closes it and focus returns to the menu button.
    await page.keyboard.press('Escape')
    await expect(topBar.drawerTrigger).toBeFocused()
  })

  test('at phone width widgets stack and nothing scrolls sideways', async ({ page }) => {
    await buildBiologyBoard(page)
    const grid = new PanelGridPom(page)
    // Remember a node inside a widget: crossing the breakpoint must restyle,
    // never remount (which would drop e.g. an in-progress recording).
    const prompt = grid.panelByLabel('Transcript').getByText('Pick a lecture to see its transcript')
    await expect(prompt).toBeVisible()
    await prompt.evaluate((el) => {
      (window as unknown as { __widgetNode: Element }).__widgetNode = el
    })
    const widgetNodeConnected = () =>
      page.evaluate(() => (window as unknown as { __widgetNode: Element }).__widgetNode.isConnected)

    await page.setViewportSize({ width: 400, height: 800 })
    await expect(grid.root).toHaveAttribute('data-layout', 'stack')
    expect(await widgetNodeConnected()).toBe(true)
    for (const box of await panelBoxes(page)) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(400)
    }
    const chip = new TopBarPom(page).scopeChip
    await expect(chip).toBeInViewport()
    const chipBox = await chip.boundingBox()
    expect(chipBox!.x + chipBox!.width).toBeLessThanOrEqual(400)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400)
    // The stacked column scrolls with the wheel to reach the last widget.
    const allCourses = grid.panelByLabel('All Courses')
    await expect(allCourses).not.toBeInViewport({ ratio: 0.5 })
    await page.mouse.move(200, 400)
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 400)
    await expect(allCourses).toBeInViewport({ ratio: 1 })

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(grid.root).toHaveAttribute('data-layout', 'free')
    expect(await widgetNodeConnected()).toBe(true)
  })
})
