import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { CalendarPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcMutation } from './api'
import { reseed } from './reseed'

/**
 * The shared motion language (flow audit 03, decision 19): with motion on,
 * what arrives comes in with the shared motion (never a list's first
 * render) and another board slides in from its tab's side; under reduced
 * motion nothing animates, and every change still happens.
 *
 * Motion is recorded, never timed, so nothing here depends on how fast the
 * browser runs: every `element.animate` call (motion/react's and the app's)
 * is noted by an init script, and a CSS arrival is read from its
 * animation-name.
 */

interface Animated {
  testid: string | null
  panel: string | null
  leaving: boolean
  keyframes: string
}

async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const calls: unknown[] = []
    ;(window as unknown as { __animated: unknown[] }).__animated = calls
    const animate = Element.prototype.animate
    Element.prototype.animate = function (this: Element, keyframes, options) {
      calls.push({
        testid: this.getAttribute('data-testid'),
        panel: this.closest('[data-panel-id]')?.getAttribute('data-panel-id') ?? null,
        leaving: this.hasAttribute('data-leaving'),
        keyframes: JSON.stringify(keyframes),
      })
      return animate.call(this, keyframes, options)
    }
  })
}

const animated = (page: Page) => page.evaluate(() => (window as unknown as { __animated: Animated[] }).__animated)
const forget = (page: Page) => page.evaluate(() => { (window as unknown as { __animated: Animated[] }).__animated.length = 0 })

async function calendarBoard(request: APIRequestContext, name: string) {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 900, height: 640,
  })
  return ws.id
}

/** The board tabs' names, in tab order. */
async function tabNames(page: Page): Promise<string[]> {
  const tabs = page.getByTestId('top-bar').getByTestId('workspace-tab')
  await expect(tabs.first()).toBeVisible()
  return tabs.evaluateAll((els) => els.map((el) => el.querySelector('button')?.textContent?.trim() ?? ''))
}

/** A box once it has stopped moving (two equal reads 100ms apart). */
async function settledBox(page: Page, testid: string) {
  const el = page.getByTestId(testid)
  let last = ''
  await expect.poll(async () => {
    const box = JSON.stringify(await el.boundingBox())
    const settled = box === last
    last = box
    return settled
  }, { intervals: [100] }).toBe(true)
  return JSON.parse(last) as { x: number; y: number; width: number; height: number }
}

test.describe('Motion', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('another board slides in from the side its tab is on', async ({ page }) => {
    await recordAnimations(page)
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const [first, second] = await tabNames(page)
    await topBar.switchToWorkspace(first)
    await topBar.expectActiveWorkspace(first)
    await expect(page.getByTestId('canvas-container')).toBeVisible()
    await forget(page)

    await topBar.switchToWorkspace(second)
    await topBar.expectActiveWorkspace(second)
    await expect.poll(async () => (await animated(page)).filter((a) => a.testid === 'canvas-container').map((a) => a.keyframes))
      .toEqual([expect.stringContaining('translateX(28px)')])

    await topBar.switchToWorkspace(first)
    await topBar.expectActiveWorkspace(first)
    await expect.poll(async () => (await animated(page)).filter((a) => a.testid === 'canvas-container').length).toBe(2)
    expect((await animated(page)).filter((a) => a.testid === 'canvas-container')[1].keyframes).toContain('translateX(-28px)')
    // The board's widgets come with it, not each on its own.
    expect((await animated(page)).filter((a) => a.panel !== null)).toEqual([])
  })

  test('a widget added arrives and one removed leaves; a block made on the grid arrives, the week shown first does not', async ({ page, request }) => {
    await calendarBoard(request, 'Motion week')
    await recordAnimations(page)
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Motion week')
    const calendar = new CalendarPom(page)
    await expect(calendar.grid).toBeVisible()
    // The week as first shown: its blocks are just there.
    await expect(calendar.root.getByTestId('calendar-block').first()).toBeVisible()
    expect(await calendar.root.getByTestId('calendar-block').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName)))
      .not.toContain('enter')

    await calendar.clickAt(2, 16.1)
    await calendar.popover.getByLabel('Title').fill('Motion seminar')
    await calendar.popover.getByRole('button', { name: 'Add' }).click()
    await expect(calendar.block('Motion seminar')).toBeVisible()
    await expect(calendar.block('Motion seminar')).toHaveCSS('animation-name', 'enter')

    await forget(page)
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('To-do')
    const grid = new PanelGridPom(page)
    await grid.expectPanelCount(2)
    await page.keyboard.press('Escape')
    const todo = grid.panelByLabel('To-do')
    const todoId = await todo.getAttribute('data-panel-id')
    await expect.poll(async () => (await animated(page)).some((a) => a.panel === todoId && a.keyframes.includes('opacity'))).toBe(true)

    await forget(page)
    await todo.getByRole('button', { name: 'Remove To-do from board' }).click()
    await grid.expectPanelCount(1)
    await expect.poll(async () => (await animated(page)).some((a) => a.leaving && a.keyframes.includes('opacity'))).toBe(true)
    await expect(page.locator('[data-leaving]')).toHaveCount(0)
  })
})

test.describe('Reduced motion', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('nothing animates, and every change still happens', async ({ page, request }) => {
    await calendarBoard(request, 'Still week')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await recordAnimations(page)
    await page.goto('/')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const topBar = new TopBarPom(page)
    const names = await tabNames(page)
    await topBar.switchToWorkspace(names[0])
    await topBar.expectActiveWorkspace(names[0])

    // Another board: there at once.
    await topBar.switchToWorkspace('Still week')
    await topBar.expectActiveWorkspace('Still week')
    const calendar = new CalendarPom(page)
    await expect(calendar.grid).toBeVisible()

    // A block made on the grid: there at once.
    await calendar.clickAt(2, 16.1)
    await calendar.popover.getByLabel('Title').fill('Still seminar')
    await calendar.popover.getByRole('button', { name: 'Add' }).click()
    const block = calendar.block('Still seminar')
    await expect(block).toBeVisible()
    await expect(block).toHaveCSS('animation-name', 'none')
    expect(await block.evaluate((el) => el.getAnimations().length)).toBe(0)

    // A widget added, made fullscreen and back, and removed: each at once.
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('To-do')
    const grid = new PanelGridPom(page)
    await grid.expectPanelCount(2)
    await page.keyboard.press('Escape')
    const todo = grid.panelByLabel('To-do')
    expect(await todo.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0)
    await todo.getByRole('button', { name: 'Fullscreen To-do' }).click()
    await expect(todo.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible()
    // Laid out full size and drawn there: no glide on the way.
    expect(await todo.evaluate((el) => (el as HTMLElement).style.transform)).toMatch(/^(none)?$/)
    await page.keyboard.press('Escape')
    await expect(todo.getByRole('button', { name: 'Fullscreen To-do' })).toBeVisible()
    expect(await todo.evaluate((el) => (el as HTMLElement).style.transform)).toMatch(/^(none)?$/)
    await todo.getByRole('button', { name: 'Remove To-do from board' }).click()
    await expect(page.locator('[data-leaving]')).toHaveCount(0)
    await grid.expectPanelCount(1)

    // Nothing above was animated from script either.
    expect(await animated(page)).toEqual([])
  })
})

test.describe('No layout jumps', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('the re-fit prompt floats over the grid: answering it moves nothing', async ({ page, request }) => {
    await calendarBoard(request, 'Prompt week')
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Prompt week')
    const calendar = new CalendarPom(page)
    const banner = calendar.root.getByTestId('refit-banner')
    const notNow = banner.getByRole('button', { name: 'Not now' })
    // In view first, so the click itself scrolls nothing.
    await notNow.scrollIntoViewIfNeeded()
    const before = await settledBox(page, 'calendar-grid')
    await notNow.click()
    await expect(banner).toHaveCount(0)
    expect(await calendar.grid.boundingBox()).toEqual(before)
  })
})
