import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { CalendarPom, CreateWorkspaceDialogPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcMutation } from './api'
import { reseed } from './reseed'
import { departures, fontsLoaded, motionSettled, recordDepartures } from './settle'

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

/**
 * Tuesday 27 Oct 2026, 09:00 in London: Up next reads "Up next: Chemistry
 * 14:00", too long for the room the seed boards' pills leave on a phone, so
 * its width follows the pills (on the real clock it can be short enough to
 * fit them all).
 */
const TUESDAY = new Date('2026-10-27T09:00:00Z')

async function onTuesday(page: Page) {
  await reseed({ now: TUESDAY.getTime() })
  await page.clock.setFixedTime(TUESDAY)
}

// On a phone, Up next takes the room the pills leave on the row, and sits at its end, once it has glided there.
const upNextFillsRoom = (page: Page) => expect.poll(() => page.evaluate(() => {
  const row = document.querySelector('[data-testid="top-bar-row-2"]')!
  const pills = row.querySelector('[data-testid="board-scope"]')?.getBoundingClientRect()
  const button = row.querySelector('[data-testid="up-next"]')!
  const gap = parseFloat(getComputedStyle(row).columnGap)
  const room = row.getBoundingClientRect().width - (pills ? pills.width + gap : 0)
  return {
    width: Math.round(button.parentElement!.getBoundingClientRect().width - room),
    right: Math.round(button.getBoundingClientRect().right - row.getBoundingClientRect().right),
    gliding: button.getAnimations().length > 0,
  }
})).toEqual({ width: 0, right: 0, gliding: false })

/**
 * Notes every error the page reports on `window` (an uncaught exception, or
 * the browser's own, e.g. "ResizeObserver loop completed with undelivered
 * notifications", which Playwright's `pageerror` can miss).
 */
async function recordErrors(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __errors: string[] }).__errors = seen
    window.addEventListener('error', (e) => seen.push(e.message))
  })
}
const errorsSeen = (page: Page) => page.evaluate(() => (window as unknown as { __errors: string[] }).__errors)

/**
 * From now until `pillMisses`, every frame: a press at the centre of each
 * scope pill on the phone's second row would land on that pill (nothing else
 * in the bar, e.g. Up next, is drawn over it).
 */
const watchPillHits = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __pillMisses: string[]; __pillWatch: boolean }
  w.__pillMisses = []
  w.__pillWatch = true
  const tick = () => {
    // The pills to press (not the last board's, kept inert while this one's load).
    const pills = '[data-testid="top-bar-row-2"] [data-testid="board-scope"]:not([inert]) :is([data-testid="scope-course"], [data-testid="scope-lecture"])'
    for (const pill of document.querySelectorAll<HTMLElement>(pills)) {
      const box = pill.getBoundingClientRect()
      if (box.width === 0) continue
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      // Something else in the bar over it (an open drawer covering the bar is not the bar's doing).
      if (!pill.contains(hit) && hit?.closest('[data-testid="top-bar"]')) w.__pillMisses.push(`${pill.dataset.testid} under ${hit?.closest('[data-testid]')?.getAttribute('data-testid')}`)
    }
    if (w.__pillWatch) requestAnimationFrame(tick)
  }
  tick()
})
const pillMisses = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __pillMisses: string[]; __pillWatch: boolean }
  w.__pillWatch = false
  return w.__pillMisses
})

/** The board tabs' names, in tab order, once they are drawn in the app's font (so their widths are final). */
async function tabNames(page: Page): Promise<string[]> {
  const tabs = page.getByTestId('top-bar').getByTestId('workspace-tab')
  await expect(tabs.first()).toBeVisible()
  await fontsLoaded(page)
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

  test('opening a board never changes a tab\'s width; its delete button arrives, and the tabs after a deleted board glide aside', async ({ page }) => {
    await recordAnimations(page)
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const tabs = page.getByTestId('top-bar').getByTestId('workspace-tab')
    const [first, second, third] = await tabNames(page)
    await topBar.switchToWorkspace(first)
    await topBar.expectActiveWorkspace(first)
    const widths = () => tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))
    const before = await widths()
    await forget(page)
    await topBar.switchToWorkspace(second)
    await topBar.expectActiveWorkspace(second)
    expect(await widths()).toEqual(before)
    // Every tab's name sits in its middle, open or not, and its delete button is a 24px target.
    const sides = await tabs.evaluateAll((els) => els.map((el) => {
      const tab = el.getBoundingClientRect()
      const name = el.querySelector('[data-tab-name]')!.getBoundingClientRect()
      return Math.abs((name.left - tab.left) - (tab.right - name.right))
    }))
    for (const gap of sides) expect(gap).toBeLessThanOrEqual(1)
    await motionSettled(topBar.root.getByRole('button', { name: `Delete ${second}` }))
    const del = (await topBar.root.getByRole('button', { name: `Delete ${second}` }).boundingBox())!
    expect(del.width).toBeGreaterThanOrEqual(24)
    expect(del.height).toBeGreaterThanOrEqual(24)
    // The delete button arrives; no tab moves.
    await expect(topBar.root.getByRole('button', { name: `Delete ${second}` })).toHaveCSS('animation-name', 'enter')
    expect((await animated(page)).filter((a) => a.testid === 'workspace-tab')).toEqual([])

    await topBar.deleteWorkspace(second)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(tabs).toHaveCount(before.length - 1)
    // The tabs after it glide left into its room.
    await expect.poll(async () => (await animated(page)).filter((a) => a.testid === 'workspace-tab').map((a) => a.keyframes))
      .toContainEqual(expect.stringMatching(/translateX\(\d+(\.\d+)?px\)/))
    expect(await tabNames(page)).toContain(third)
  })

  test('no tab is wider than it was before tabs kept their width', async ({ page }) => {
    // Each seed board's tab at 1440px, measured once on main (c2dce07, DM Sans):
    // open, it was the name in bold and a delete button; not open, the name alone.
    const before: Record<string, { open: number; closed: number }> = {
      'Evening Review': { open: 176.98, closed: 150.5 },
      'Exam Prep': { open: 145.27, closed: 120.41 },
      'In Lecture': { open: 141.47, closed: 116.25 },
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const tabs = page.getByTestId('top-bar').getByTestId('workspace-tab')
    const names = await tabNames(page)
    expect(names.toSorted()).toEqual(Object.keys(before))
    for (const open of names) {
      await topBar.switchToWorkspace(open)
      await topBar.expectActiveWorkspace(open)
      const widths = await tabs.evaluateAll((els) => els.map((el) => ({
        name: el.querySelector('[data-tab-name]')!.getAttribute('data-tab-name')!,
        width: el.getBoundingClientRect().width,
      })))
      for (const { name, width } of widths) {
        expect(width, `${name}, with ${open} open`).toBeLessThanOrEqual(before[name][name === open ? 'open' : 'closed'] + 0.01)
      }
    }
  })

  test('to-do rows glide to their new places when the list re-sorts', async ({ page }) => {
    await recordAnimations(page)
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('Glide')
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('To-do')
    await page.keyboard.press('Escape')
    const todo = new PanelGridPom(page).panelByLabel('To-do')
    const rows = todo.getByTestId('todo-item')
    await expect(rows.nth(2)).toBeVisible()
    const first = (await rows.first().getAttribute('data-plan-item-id'))!
    await forget(page)
    // Ticked: after its "Done · Undo" (5s), the row goes to Done today, and the rows under it glide up.
    await todo.getByRole('checkbox').first().click()
    await expect.poll(async () => (await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-plan-item-id')))).indexOf(first), { timeout: 10_000 }).toBeGreaterThan(0)
    await expect.poll(async () => (await animated(page)).filter((a) => a.testid === 'todo-item').map((a) => a.keyframes))
      .toContainEqual(expect.stringMatching(/translateY\(\d+(\.\d+)?px\)/))
    // It and the "Done today" heading arrive there with the shared motion.
    const doneRow = todo.locator(`[data-testid="todo-item"][data-plan-item-id="${first}"]`)
    await expect(doneRow).toHaveCSS('animation-name', 'enter')
    await expect(todo.getByTestId('todo-done-heading')).toHaveCSS('animation-name', 'enter')
  })

  test('fullscreen and back puts the board\'s scroll and every widget back where they were, even scrolled to the end', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    const grid = new PanelGridPom(page)
    await expect(grid.panels.first()).toBeVisible()
    const scroll = await grid.root.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop })
    expect(scroll).toBeGreaterThan(0)
    const boxes = () => grid.panels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    await motionSettled(grid.panels)
    const before = await boxes()
    // The lowest widget, on screen at the end of the board (so the click scrolls nothing).
    const label = await grid.panels.evaluateAll((els) => {
      const lowest = els.reduce((a, b) => (b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a))
      return lowest.querySelector('[data-testid="panel-title"]')?.textContent ?? ''
    })
    const widget = grid.panelByLabel(label)
    await widget.getByRole('button', { name: `Fullscreen ${label}` }).click()
    await expect(widget.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(widget.getByRole('button', { name: `Fullscreen ${label}` })).toBeVisible()
    await motionSettled(grid.panels)
    expect(await grid.root.evaluate((el) => el.scrollTop)).toBe(scroll)
    expect(await boxes()).toEqual(before)
    expect(scroll, 'the click scrolled nothing').toBe(await grid.root.evaluate((el) => el.scrollHeight - el.clientHeight))
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

test.describe('Leaving', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a deleted block and an answered re-fit prompt leave with the shared motion, then are gone', async ({ page, request }) => {
    await calendarBoard(request, 'Leave week')
    await recordDepartures(page)
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Leave week')
    const calendar = new CalendarPom(page)
    await expect(calendar.grid).toBeVisible()

    await calendar.clickAt(2, 16.1)
    await calendar.popover.getByLabel('Title').fill('Leaving seminar')
    await calendar.popover.getByRole('button', { name: 'Add' }).click()
    await expect(calendar.block('Leaving seminar')).toBeVisible()
    await calendar.block('Leaving seminar').click()
    await calendar.popover.getByRole('button', { name: 'Delete' }).click()
    await calendar.popover.getByRole('button', { name: 'Delete it?' }).click()
    await expect(calendar.block('Leaving seminar')).toHaveCount(0)
    await expect.poll(async () => (await departures(page)).some((d) => d.testids[0] === 'calendar-block-leaving' && d.animation === 'leave')).toBe(true)
    await expect(calendar.root.getByTestId('calendar-block-leaving')).toHaveCount(0)

    const banner = calendar.root.getByTestId('refit-banner')
    await banner.getByRole('button', { name: 'Not now' }).click()
    await expect.poll(async () => (await departures(page)).some((d) => d.testids.includes('refit-banner-leaving') && d.animation === 'leave')).toBe(true)
    await expect(banner).toHaveCount(0)
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
    await recordDepartures(page)
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

    // A block deleted and the re-fit prompt answered: gone at once.
    const departed = (await departures(page)).length
    await block.click()
    await calendar.popover.getByRole('button', { name: 'Delete' }).click()
    await calendar.popover.getByRole('button', { name: 'Delete it?' }).click()
    await expect(block).toHaveCount(0)
    await calendar.root.getByTestId('refit-banner').getByRole('button', { name: 'Not now' }).click()
    await expect(calendar.root.getByTestId('refit-banner')).toHaveCount(0)
    expect((await departures(page)).slice(departed)).toEqual([])

    // Nothing above was animated from script either.
    expect(await animated(page)).toEqual([])
  })

  test('on a phone, Up next takes its new width at once as the pills change', async ({ page }) => {
    await onTuesday(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await recordAnimations(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await expect(topBar.root).toHaveAttribute('data-layout', 'phone')
    const widths = new Set<number>()
    for (const name of await tabNames(page)) {
      await topBar.switchToWorkspace(name)
      await topBar.expectActiveWorkspace(name)
      await expect(topBar.root.getByTestId('board-scope')).toBeVisible()
      await expect(topBar.upNext).toContainText('Chemistry')
      await upNextFillsRoom(page)
      widths.add(Math.round((await topBar.upNext.boundingBox())!.width))
    }
    // And a board with no pills, where it has the whole row.
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('Still phone board')
    await topBar.expectActiveWorkspace('Still phone board')
    await expect(topBar.root.getByTestId('board-scope')).toHaveCount(0)
    await upNextFillsRoom(page)
    widths.add(Math.round((await topBar.upNext.boundingBox())!.width))
    // The pills differ, so Up next changed width, and never glided.
    expect(widths.size).toBeGreaterThan(1)
    expect((await animated(page)).filter((a) => a.testid === 'up-next')).toEqual([])
  })
})

test.describe('No layout jumps', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('the re-fit prompt sits in the grid\'s footer: answering it moves nothing', async ({ page, request }) => {
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

  test('on a phone, switching boards or adding the first widget never moves the board, and Up next glides to fill the room the pills leave', async ({ page }) => {
    await recordAnimations(page)
    // The glide never trips the browser's ResizeObserver loop guard.
    await recordErrors(page)
    await onTuesday(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await expect(topBar.root).toHaveAttribute('data-layout', 'phone')
    const canvasTop = async () => Math.round((await page.getByTestId('canvas-container').boundingBox())!.y)
    const expectFillsRoom = () => upNextFillsRoom(page)
    const upNextWidth = async () => Math.round((await topBar.upNext.boundingBox())!.width)
    const glides = async () => (await animated(page)).filter((a) => a.testid === 'up-next' && a.keyframes.includes('width')).length
    const names = await tabNames(page)
    await topBar.switchToWorkspace(names[0])
    await expect(topBar.root.getByTestId('board-scope')).toBeVisible()
    await expectFillsRoom()
    const top = await canvasTop()
    // Boards whose pills differ (and while each one's pills load): the board stays put.
    const watch = () => page.evaluate(() => {
      const tops = new Set<number>()
      const tick = () => {
        const el = document.querySelector('[data-testid="canvas-container"]')
        if (el) tops.add(Math.round(el.getBoundingClientRect().top))
        if ((window as unknown as { __watching: boolean }).__watching) requestAnimationFrame(tick)
      }
      ;(window as unknown as { __watching: boolean; __tops: Set<number> }).__watching = true
      ;(window as unknown as { __tops: Set<number> }).__tops = tops
      tick()
    })
    const watched = () => page.evaluate(() => {
      (window as unknown as { __watching: boolean }).__watching = false
      return [...(window as unknown as { __tops: Set<number> }).__tops]
    })
    await watch()
    const changes = { wider: 0, narrower: 0 }
    for (const name of [names[1], names[2], names[0]]) {
      await forget(page)
      const before = await upNextWidth()
      await watchPillHits(page)
      await topBar.switchToWorkspace(name)
      await topBar.expectActiveWorkspace(name)
      await expect(page.locator('[data-panel-id]').first()).toBeVisible()
      await expectFillsRoom()
      // Never over a pill, even the moment one arrives.
      expect(await pillMisses(page), `to ${name}`).toEqual([])
      const after = await upNextWidth()
      if (after > before) {
        // Wider: it glided out, it did not jump.
        changes.wider++
        await expect.poll(glides, { message: `to ${name}` }).toBeGreaterThan(0)
      } else if (after < before) {
        // Narrower: there at once, out of the pills' way.
        changes.narrower++
        expect(await glides(), `to ${name}`).toBe(0)
      }
    }
    expect(changes.wider).toBeGreaterThan(0)
    expect(changes.narrower).toBeGreaterThan(0)
    expect(await watched()).toEqual([top])

    await topBar.openCreateWorkspaceDialog()
    await forget(page)
    await new CreateWorkspaceDialogPom(page).createWorkspace('Phone board')
    await topBar.expectActiveWorkspace('Phone board')
    expect(await canvasTop()).toBe(top)
    // A board with no pills: Up next glides out into the whole row.
    await expect(topBar.root.getByTestId('board-scope')).toHaveCount(0)
    await expectFillsRoom()
    await expect.poll(glides).toBeGreaterThan(0)
    await watch()
    await topBar.openDrawer()
    await watchPillHits(page)
    await new SidebarPom(page).addWidget('Calendar')
    await expect(topBar.root.getByTestId('board-scope')).toBeVisible()
    await expectFillsRoom()
    // The pills arriving: Up next makes way at once, never drawn over them.
    expect(await pillMisses(page)).toEqual([])
    expect(await watched()).toEqual([top])
    expect(await errorsSeen(page)).toEqual([])
  })

  test('at 1024px the lecture pill arriving never moves the board tabs or New board', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    // The lecture is held, so its pill says "Loading..." until it is let go.
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    await page.route(/lectures\.byId/, async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await tabNames(page)
    const lecture = topBar.root.getByTestId('board-scope').getByText('Loading...').filter({ visible: true })
    await expect(lecture).toBeVisible()
    // To the pixel: the tabs take a sliver of the shortfall the pills can't.
    const boxes = () => page.evaluate(() => ['[data-testid="board-tabs"]', '[data-testid="workspace-tab"]', '[aria-label="New board"]'].map((selector) => {
      const box = document.querySelector(selector)!.getBoundingClientRect()
      return [box.left, box.width].map(Math.round)
    }))
    await motionSettled(topBar.root)
    const before = await boxes()
    release()
    await expect(lecture).toHaveCount(0)
    await motionSettled(topBar.root)
    expect(await boxes()).toEqual(before)
  })

  test('scrolled to the end of the hours, answering the re-fit prompt still moves nothing', async ({ page, request }) => {
    await calendarBoard(request, 'Prompt week')
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Prompt week')
    const calendar = new CalendarPom(page)
    const banner = calendar.root.getByTestId('refit-banner')
    const notNow = banner.getByRole('button', { name: 'Not now' })
    await notNow.scrollIntoViewIfNeeded()
    const scroll = calendar.root.getByTestId('calendar-scroll')
    const end = await scroll.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop })
    expect(end).toBeGreaterThan(0)
    const before = await settledBox(page, 'calendar-grid')
    await notNow.click()
    await expect(banner).toHaveCount(0)
    expect(await calendar.grid.boundingBox()).toEqual(before)
    expect(await scroll.evaluate((el) => el.scrollTop)).toBe(end)
    // Scrolling back up gives the kept room back.
    await scroll.evaluate((el) => { el.scrollTop = 0 })
    await expect.poll(() => calendar.root.getByTestId('calendar-scroll-slack').evaluate((el) => el.getBoundingClientRect().height)).toBe(0)
  })
})
