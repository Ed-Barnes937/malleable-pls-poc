import { test, expect, type Locator, type Page } from '@playwright/test'
import { TopBarPom, PanelGridPom, PanelContainerPom, SidebarPom } from './pom'
import { reseed } from './reseed'

/** A widget's box as laid out (left, top, width, height on the board), without its scale-in. */
function layoutOf(panel: Locator) {
  return panel.evaluate((el) => {
    const style = getComputedStyle(el)
    const px = (v: string) => Math.round(parseFloat(v))
    return { x: px(style.left), y: px(style.top), width: px(style.width), height: px(style.height) }
  })
}

const isLayoutSave = (url: string) => url.includes('workspaces.updateLayouts')

/**
 * Waits for a layout save that has `panel` at `box` to land (each save carries
 * the whole board, so later saves keep it).
 */
async function layoutSaved(page: Page, panel: Locator, box: { x: number; y: number; width: number; height: number }) {
  const id = await panel.getAttribute('data-panel-id')
  const saved = `"id":"${id}","pos_x":${box.x},"pos_y":${box.y},"width":${box.width},"height":${box.height}`
  return page.waitForResponse((r) =>
    r.request().method() === 'POST' && isLayoutSave(r.url()) && (r.request().postData() ?? '').includes(saved))
}

/** Counts layout saves from now on. */
function countLayoutSaves(page: Page) {
  const saves = { n: 0 }
  page.on('request', (r) => { if (r.method() === 'POST' && isLayoutSave(r.url())) saves.n++ })
  return saves
}

async function openEveningReview(page: Page) {
  await page.goto('/')
  await new TopBarPom(page).expectActiveWorkspace('Evening Review')
  const grid = new PanelGridPom(page)
  await grid.expectPanelCount(4)
  return grid
}

/** Presses on a widget's header, clear of its buttons, and moves by (dx, dy), still held. */
async function grabHeader(page: Page, panel: Locator, dx: number, dy: number) {
  const header = (await new PanelContainerPom(panel).header.boundingBox())!
  const from = { x: header.x + 80, y: header.y + header.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 })
}

test.describe('Panel management', () => {
  test('panels are visible for the board the app opens on', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // The app opens on the first board in tab order: Evening Review in the seed.
    await expect(topBar.workspaceTabs.first()).toHaveText('Evening Review')
    await topBar.expectActiveWorkspace('Evening Review')
    await grid.expectPanelCount(4)
    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('Test Me')
  })

  test('removing a panel updates the canvas', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    await topBar.switchToWorkspace('Evening Review')
    await grid.expectPanelCount(4)

    // Remove the Connections panel
    const targetPanel = grid.panelByLabel('Connections')
    const container = new PanelContainerPom(targetPanel)
    await container.remove()

    await grid.expectPanelCount(3)
    await expect(grid.panelByLabel('Connections')).toBeHidden()
  })
})

test.describe('Moving and resizing widgets', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('pressing a widget on the seeded board brings it in front of the others', async ({ page }) => {
    const grid = await openEveningReview(page)
    const zIndexes = () => grid.panels.evaluateAll((els) =>
      els.map((el) => ({ title: el.querySelector('[data-testid="panel-title"]')?.textContent, z: Number(getComputedStyle(el).zIndex) })))

    await new PanelContainerPom(grid.panelByLabel('Your Progress')).label.click()
    const z = await zIndexes()
    const top = Math.max(...z.map((p) => p.z))
    expect(z.filter((p) => p.z === top).map((p) => p.title)).toEqual(['Your Progress'])
  })

  test('dragging a widget by its header lands it on the 20px grid, and it stays there after a reload', async ({ page }) => {
    const grid = await openEveningReview(page)
    const testMe = grid.panelByLabel('Test Me')
    expect(await layoutOf(testMe)).toMatchObject({ x: 540, y: 40 })

    await grabHeader(page, testMe, 103, 57)
    // Shown where it will land while still dragging: 643 -> 640, 97 -> 100.
    await expect.poll(() => layoutOf(testMe)).toMatchObject({ x: 640, y: 100 })
    const saved = layoutSaved(page, testMe, { x: 640, y: 100, width: 420, height: 460 })
    await page.mouse.up()
    await saved

    await page.reload()
    await grid.expectPanelCount(4)
    expect(await layoutOf(testMe)).toEqual({ x: 640, y: 100, width: 420, height: 460 })
  })

  test('Escape during a drag puts the widget back and saves nothing', async ({ page }) => {
    const grid = await openEveningReview(page)
    const testMe = grid.panelByLabel('Test Me')
    // Press it once first, so raising it isn't the save we'd catch.
    await new PanelContainerPom(testMe).label.click()
    await page.waitForLoadState('networkidle')
    const saves = countLayoutSaves(page)

    await grabHeader(page, testMe, 160, 120)
    await expect.poll(() => layoutOf(testMe)).toMatchObject({ x: 700, y: 160 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect.poll(() => layoutOf(testMe)).toMatchObject({ x: 540, y: 40 })
    await page.waitForLoadState('networkidle')
    expect(saves.n).toBe(0)
  })

  test('by keyboard: ] selects a widget, Alt+arrow moves it, arrows on its handle resize it, and both are saved', async ({ page }) => {
    const grid = await openEveningReview(page)
    const transcript = grid.panelByLabel('Transcript')

    // ] cycles the selection through the widgets; stop on Transcript (40, 40, 460 x 420),
    // whose handles then become tab stops.
    const transcriptTopLeft = transcript.getByRole('button', { name: 'Resize Transcript top left' })
    for (let i = 0; i < 4 && (await transcriptTopLeft.getAttribute('tabindex')) !== '0'; i++) await page.keyboard.press(']')
    await expect(transcriptTopLeft).toHaveAttribute('tabindex', '0')
    let saved = layoutSaved(page, transcript, { x: 60, y: 60, width: 460, height: 420 })
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('Alt+ArrowRight')
    await expect.poll(() => layoutOf(transcript)).toMatchObject({ x: 60, y: 60 })
    await saved

    // Only the selected widget's handles are tab stops.
    const handles = transcript.getByRole('button', { name: /^Resize Transcript / })
    await expect(handles).toHaveCount(8)
    await expect(grid.root.getByRole('button', { name: /^Resize / }).and(grid.root.locator('[tabindex="0"]'))).toHaveCount(8)
    const bottom = transcript.getByRole('button', { name: 'Resize Transcript bottom', exact: true })
    await bottom.focus()
    saved = layoutSaved(page, transcript, { x: 60, y: 60, width: 460, height: 440 })
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => layoutOf(transcript)).toEqual({ x: 60, y: 60, width: 460, height: 440 })
    await saved

    await page.reload()
    await grid.expectPanelCount(4)
    expect(await layoutOf(transcript)).toEqual({ x: 60, y: 60, width: 460, height: 440 })
  })

  test('dragging a handle resizes the widget on the grid and keeps it at its minimum', async ({ page }) => {
    const grid = await openEveningReview(page)
    const weekly = grid.panelByLabel('Your Progress')
    expect(await layoutOf(weekly)).toEqual({ x: 40, y: 500, width: 300, height: 300 })
    const corner = weekly.getByRole('button', { name: 'Resize Your Progress bottom right' })
    await weekly.hover()
    const box = (await corner.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 300, box.y - 300, { steps: 8 })
    // Your Progress is at least 350 x 250; on the grid that is 360 x 260.
    await expect.poll(() => layoutOf(weekly)).toEqual({ x: 40, y: 500, width: 360, height: 260 })
    const saved = layoutSaved(page, weekly, { x: 40, y: 500, width: 360, height: 260 })
    await page.mouse.up()
    await saved
    await page.reload()
    expect(await layoutOf(weekly)).toEqual({ x: 40, y: 500, width: 360, height: 260 })
  })

  test('a widget dropped from the board menu is still added (native drag and drop)', async ({ page }) => {
    const grid = await openEveningReview(page)
    await new TopBarPom(page).openDrawer()
    const tile = new SidebarPom(page).lensItems.filter({ hasText: 'All Courses' })
    // Synthetic HTML5 drag events through the real handlers (the drawer tile's
    // dragstart, the board's dragover and drop): Playwright's mouse doesn't
    // drive a native drag here.
    await tile.evaluate((el) => {
      const dt = new DataTransfer()
      el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      ;(window as unknown as { __dt: DataTransfer }).__dt = dt
    })
    const accepted = await grid.root.evaluate((canvas) => {
      const dt = (window as unknown as { __dt: DataTransfer }).__dt
      const r = canvas.getBoundingClientRect()
      const at = { clientX: r.left + 1100, clientY: r.top + 100 }
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...at })
      canvas.dispatchEvent(over)
      canvas.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }))
      return over.defaultPrevented
    })
    expect(accepted).toBe(true)
    await grid.expectPanelCount(5)
    await grid.expectHasPanel('All Courses')
  })

  test('at phone width the stacked widgets have no resize handles and Alt+arrow moves nothing', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 })
    const grid = await openEveningReview(page)
    await expect(grid.root).toHaveAttribute('data-layout', 'stack')
    await expect(grid.root.getByRole('button', { name: /^Resize / })).toHaveCount(0)
    // ] selects (and raises, which is saved) a widget.
    await page.keyboard.press(']')
    await page.waitForLoadState('networkidle')
    const saves = countLayoutSaves(page)
    const before = await grid.panelByLabel('Transcript').evaluate((el) => [(el as HTMLElement).offsetLeft, (el as HTMLElement).offsetTop])
    await page.keyboard.press('Alt+ArrowRight')
    await page.waitForTimeout(600)
    expect(saves.n).toBe(0)
    expect(await grid.panelByLabel('Transcript').evaluate((el) => [(el as HTMLElement).offsetLeft, (el as HTMLElement).offsetTop])).toEqual(before)
  })
})
