import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { CalendarPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { expectStillAtBottomAsToastLeaves } from './toast-bar'
import { trpcMutation, trpcQuery } from './api'

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

  test('a ticked to-do says Done · Undo in place, Undo reopens it, and left alone it moves to Done today', async ({ page, request }) => {
    const todo = new PanelGridPom(page).panelByLabel('To-do')
    const title = 'Make flashcards: cell structure'
    const row = todo.getByTestId('todo-item').filter({ hasText: title })

    await row.getByRole('checkbox', { name: `Done: ${title}` }).click()
    await expect(row).toHaveAttribute('data-just-done', 'shown')
    await expect(row.getByText(title)).toHaveCSS('text-decoration-line', 'line-through')
    await expect(row.getByText('Done', { exact: true })).toBeVisible()
    await expect(todo.getByText('Done today')).toHaveCount(0)

    // Undo: open again at once. The reopen saves after the tick has, so
    // wait for it before reloading (a reload would cancel it).
    const reopened = page.waitForResponse((r) => r.url().includes('planItems.update'))
    await row.getByRole('button', { name: `Undo: ${title}` }).click()
    await expect(row.getByRole('checkbox', { name: `Done: ${title}` })).toHaveAttribute('aria-checked', 'false')
    await expect(row).not.toHaveAttribute('data-just-done')
    await reopened
    const saved = await trpcQuery<{ title: string; status: string }[]>(request, 'planItems.list', { kinds: ['task'] })
    expect(saved.find((item) => item.title === title)?.status).toBe('open')
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

/**
 * A real tap fires its mouse events and click after the finger lifts, at the
 * point tapped. The Calendar opens a popover as the finger lifts, and on a
 * phone the popover fills the grid, so that click used to land on whatever
 * was under the finger: a block tapped at 16:00 was marked done instead of
 * showing its popover.
 */
/** Records every press (mouse event or click) that reaches a calendar popover, past any listener that cancels it first. */
async function watchPressesInPopover(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { pressedInPopover: string[] }
    w.pressedInPopover = []
    for (const type of ['mousedown', 'mouseup', 'click']) {
      document.addEventListener(type, (e) => {
        if ((e.target as Element).closest?.('[data-calendar-popover]')) w.pressedInPopover.push(type)
      }, true)
    }
  })
}

/** The presses that reached a popover so far, once the tap's own have had two frames to arrive. */
async function pressesInPopover(page: Page) {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return (window as unknown as { pressedInPopover: string[] }).pressedInPopover
  })
}

test.describe('Phone calendar taps', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true })
  test.beforeEach(async ({ request }) => {
    await reseed()
    await myWeekBoard(request)
  })
  test.afterAll(async () => { await reseed() })

  for (const theme of ['light', 'dark'] as const) {
    test(`a tap on a block opens its popover and presses nothing in it (${theme})`, async ({ page, request }) => {
      const today = new Date()
      const at = (h: number, m = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m)
      // Early, mid-morning and late in the day, long and short; the lecture
      // moment ones have Go to moment, Mark done and Edit time in theirs.
      const fromMoment = { source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 2_200_000 }
      const blocks = [
        { title: 'Tap early', start: at(7), min: 60, extra: {} },
        { title: 'Tap ten', start: at(10), min: 60, extra: fromMoment },
        { title: 'Tap four', start: at(16), min: 60, extra: fromMoment },
        { title: 'Tap short', start: at(16, 30), min: 20, extra: fromMoment },
        { title: 'Tap late', start: at(20), min: 60, extra: {} },
      ]
      const ids: Record<string, string> = {}
      for (const b of blocks) {
        const row = await trpcMutation<{ id: string }>(request, 'planItems.create', {
          kind: 'task', title: b.title, course: 'biology', duration_min: b.min,
          starts_at: b.start.toISOString(), ends_at: new Date(b.start.getTime() + b.min * 60_000).toISOString(), ...b.extra,
        })
        ids[b.title] = row.id
      }
      await page.addInitScript((t) => localStorage.setItem('pls-theme', t), theme)
      await page.goto('/')
      await new TopBarPom(page).switchToWorkspace('My week')
      if (theme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
      await watchPressesInPopover(page)

      const calendar = new CalendarPom(page)
      for (const b of blocks) {
        const block = calendar.block(b.title)
        await block.scrollIntoViewIfNeeded()
        const box = (await block.boundingBox())!
        await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(10, box.height / 2))

        await expect(calendar.popover, b.title).toBeVisible()
        expect(await pressesInPopover(page), b.title).toEqual([])
        const saved = await trpcQuery<{ status: string }>(request, 'planItems.byId', ids[b.title])
        expect(saved.status, b.title).toBe('open')

        await page.keyboard.press('Escape')
        await expect(calendar.popover).toHaveCount(0)
      }
    })
  }

  test('a tap on empty time opens a new block and presses nothing in it', async ({ page }) => {
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    await watchPressesInPopover(page)
    const calendar = new CalendarPom(page)
    // 03:30, free time near the top of the grid: the new block's popover opens over it.
    const scroll = calendar.root.getByTestId('calendar-scroll')
    await scroll.scrollIntoViewIfNeeded()
    await scroll.evaluate((el) => { el.scrollTop = 0 })
    const point = await calendar.point(0, 3.5)
    await page.touchscreen.tap(point.x, point.y)
    await expect(calendar.popover).toBeVisible()
    expect(await pressesInPopover(page)).toEqual([])
  })
})

test.describe('Phone top bar', () => {
  test.use({ viewport: { width: 400, height: 860 } })
  test.beforeEach(async ({ request, page }) => {
    await reseed()
    await myWeekBoard(request)
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
  })
  test.afterAll(async () => { await reseed() })

  test('holds the menu, the tabs and the widgets button; Activity, the theme and board appearance are in the board menu', async ({ page }) => {
    const topBar = new TopBarPom(page)
    const widgets = topBar.root.getByRole('button', { name: 'Tidy up widgets' })
    await expect(topBar.root).toHaveAttribute('data-layout', 'phone')
    await expect(topBar.drawerTrigger).toBeVisible()
    await expect(widgets).toBeVisible()
    await expect(topBar.root.getByTestId('activity-button')).toHaveCount(0)
    await expect(topBar.root.getByRole('button', { name: /^Switch to (dark|light) mode$/ })).toHaveCount(0)
    await expect(topBar.root.getByRole('button', { name: 'Board appearance' })).toHaveCount(0)
    // One row: the widgets button sits level with the menu button, on screen.
    const menuBox = (await topBar.drawerTrigger.boundingBox())!
    const widgetsBox = (await widgets.boundingBox())!
    expect(Math.abs(widgetsBox.y - menuBox.y)).toBeLessThan(2)
    expect(widgetsBox.x + widgetsBox.width).toBeLessThanOrEqual(400)

    // Keyboard: open the menu, and the controls are in it.
    await topBar.drawerTrigger.focus()
    await page.keyboard.press('Enter')
    const drawer = page.getByTestId('drawer-sidebar')
    await expect(drawer).toBeFocused()
    await expect(topBar.drawerTrigger).toHaveAttribute('aria-expanded', 'true')
    await expect(drawer.getByTestId('drawer-appearance')).toContainText('Background')
    await drawer.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await drawer.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // Activity opens over the menu with focus in it; Escape closes it alone
    // and focus goes back to its button; a second Escape closes the menu.
    const activityButton = drawer.getByTestId('activity-button')
    await activityButton.focus()
    await page.keyboard.press('Enter')
    const activity = page.getByRole('dialog', { name: 'Activity' })
    await expect(activity).toBeVisible()
    await expect(activity.getByRole('button', { name: 'Close activity' })).toBeFocused()
    await expect(activity).toHaveAttribute('aria-modal', 'true')
    await expect(activityButton).toHaveAttribute('aria-haspopup', 'dialog')
    // Modal: Tab and Shift+Tab stay inside it.
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key)
      expect(await activity.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(activity).toHaveCount(0)
    await expect(topBar.drawerTrigger).toHaveAttribute('aria-expanded', 'true')
    await expect(activityButton).toBeFocused()

    // Its backdrop sits over the menu too: a tap on the menu's visible edge
    // closes Activity and reaches nothing in the menu.
    await activityButton.click()
    await expect(activity).toBeVisible()
    await page.mouse.click(20, 400)
    await expect(activity).toHaveCount(0)
    await expect(topBar.drawerTrigger).toHaveAttribute('aria-expanded', 'true')

    // The board menu is modal too: Tab and Shift+Tab stay inside it.
    await expect(drawer).toHaveAttribute('aria-modal', 'true')
    await expect(topBar.drawerTrigger).toHaveAttribute('aria-haspopup', 'dialog')
    await drawer.getByRole('button', { name: 'Close board menu' }).focus()
    for (const key of ['Shift+Tab', 'Shift+Tab', 'Tab', 'Tab', 'Tab']) {
      await page.keyboard.press(key)
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(topBar.drawerTrigger).toHaveAttribute('aria-expanded', 'false')
    await expect(topBar.drawerTrigger).toBeFocused()

    // A wide screen keeps them in the top bar, and the menu as it was.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(topBar.root).not.toHaveAttribute('data-layout', 'phone')
    await expect(topBar.root.getByTestId('activity-button')).toBeVisible()
    await expect(topBar.root.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
    await expect(topBar.root.getByRole('button', { name: 'Board appearance' })).toBeVisible()
    await expect(drawer.getByTestId('drawer-app-controls')).toHaveCount(0)
    await expect(drawer.getByTestId('drawer-appearance')).toHaveCount(0)
  })

  test('a toast leaving while the board is scrolled to its bottom moves nothing under the finger', async ({ page }) => {
    const topBar = new TopBarPom(page)
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Coming up')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('toast-host')).toContainText('Coming up added')
    await expectStillAtBottomAsToastLeaves(page, new PanelGridPom(page))
  })

  test('a "Back to ..." toast sits under the board instead of covering it, and is reachable from the keyboard', async ({ page, request }) => {
    const today = new Date()
    const at = (h: number, m = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).toISOString()
    await trpcMutation(request, 'planItems.create', {
      kind: 'task', title: 'Review: chloroplast DNA', starts_at: at(12), ends_at: at(12, 30), duration_min: 30,
      course: 'biology', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 2_200_000,
    })
    await page.reload()
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    await calendar.block('Review: chloroplast DNA').click()
    await calendar.popover.getByRole('button', { name: 'Go to moment' }).click()
    await topBar.expectActiveWorkspace('Evening Review')

    const host = page.getByTestId('toast-host')
    await expect(host).toHaveAttribute('data-layout', 'bar')
    await expect(page.getByTestId('toast-announcer')).toHaveAttribute('aria-live', 'polite')
    await expect(host).toContainText('Opened 36:40 in Evening Review')
    const back = host.getByRole('button', { name: 'Back to My week' })
    await expect(back).toBeInViewport()
    // The board ends where the toast bar starts: none of it is underneath.
    const board = (await page.getByTestId('canvas-container').boundingBox())!
    const toast = (await host.getByTestId('toast').boundingBox())!
    const barHeight = (await host.boundingBox())!.height
    expect(board.y + board.height).toBeLessThanOrEqual(toast.y + 1)
    expect(toast.y + toast.height).toBeLessThanOrEqual(860)

    await back.focus()
    await page.keyboard.press('Enter')
    await topBar.expectActiveWorkspace('My week')
    await expect(host).not.toContainText('Opened')
    // With nothing to say, the bar keeps its room (decision 22): nothing on the board moves.
    expect((await host.boundingBox())!.height).toBe(barHeight)
  })
})

/** Tuesday 27 Oct 2026, 09:00 in London (GMT): Chemistry 14:00, a shift 17:00-22:00, no study planned yet. */
const TUESDAY = new Date('2026-10-27T09:00:00Z')

test.describe('Phone today line', () => {
  test.use({ viewport: { width: 400, height: 860 } })
  test.afterAll(async () => { await reseed() })

  test('shows the short form under the tabs, beside the Showing chip, never cut off', async ({ page, request }) => {
    await reseed({ now: TUESDAY })
    await myWeekBoard(request)
    await page.clock.setFixedTime(TUESDAY)
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('My week')
    await expect(topBar.todayLine).toBeVisible()
    await expect(topBar.todayLine).toHaveAttribute('title', 'Tue · Chemistry 14:00 · shift 17:00 · 2h to study')

    const notClipped = () => topBar.todayLine.evaluate((el) => el.offsetWidth <= el.parentElement!.clientWidth)
    for (const width of [400, 360]) {
      await page.setViewportSize({ width, height: 800 })
      // Drops parts (the weekday, then later blocks) rather than cutting one off.
      await expect(topBar.todayLine).toBeVisible()
      await expect(topBar.todayLine).toContainText('2h to study')
      await expect(topBar.todayLine).toContainText('Chemistry 14:00')
      await expect.poll(notClipped).toBe(true)
      // Under the tabs, on the Showing chip's row, after the chip (read once
      // the bar has settled: the chip's text and the web font arrive late).
      await expect.poll(async () => {
        const line = (await topBar.todayLine.boundingBox())!
        const chip = (await topBar.scopeChip.boundingBox())!
        const menu = (await topBar.drawerTrigger.boundingBox())!
        return {
          underTabs: line.y >= menu.y + menu.height,
          chipRow: Math.abs((line.y + line.height / 2) - (chip.y + chip.height / 2)) < 2,
          afterChip: line.x >= chip.x + chip.width,
          onScreen: line.x + line.width <= width,
        }
      }).toEqual({ underTabs: true, chipRow: true, afterChip: true, onScreen: true })
    }
  })
})
