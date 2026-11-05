import { test, expect, type Page } from '@playwright/test'
import { CalendarPom, CreateWorkspaceDialogPom, PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'

/**
 * The top bar's Up next (flow audit 04b): the next item in the student's
 * calendar, always in the bar, opening a popover with the next few items,
 * what is due this week, and Plan my week / Add Calendar to this board.
 */

/** Tuesday 27 Oct 2026, 09:00 in London (GMT): Chemistry 14:00, a shift 17:00-22:00, a quiz Thursday, a lab report Friday. */
const TUESDAY = new Date('2026-10-27T09:00:00Z')
/** 15:00 the same day: Chemistry (14:00-16:00) is on now. */
const TUESDAY_AFTERNOON = new Date('2026-10-27T15:00:00Z')

async function openBlankBoard(page: Page, now: Date, arrange?: () => Promise<void>) {
  await reseed({ now })
  await arrange?.()
  await page.clock.setFixedTime(now)
  await page.goto('/')
  const topBar = new TopBarPom(page)
  await topBar.openCreateWorkspaceDialog()
  await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
  await topBar.expectActiveWorkspace('My week')
  await new PanelGridPom(page).expectEmpty()
  return topBar
}

/** The popover's two actions sit on one row, and its summary is two whole lines. */
async function expectTidyPopover(topBar: TopBarPom) {
  const plan = (await topBar.upNextPopover.getByTestId('up-next-plan-week').boundingBox())!
  const add = (await topBar.upNextPopover.getByTestId('up-next-add-calendar').boundingBox())!
  expect(Math.abs(plan.y - add.y)).toBeLessThan(2)
  await expect(topBar.upNextPopover.getByTestId('up-next-add-calendar')).toHaveAccessibleName('Add Calendar to this board')
  const lines = await topBar.upNextPopover.getByTestId('up-next-summary').locator('p').evaluateAll((ps) => ps.map((p) => Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight))))
  expect(lines).toEqual([1, 1])
}

test.describe('Up next', () => {
  test.afterAll(async () => { await reseed() })

  test('on a board with no Calendar it names the next item, lists the week, and Plan my week adds a Calendar here with Help me plan open in Week view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY)
    await expect(topBar.upNext).toContainText('Up next: Chemistry 14:00')
    await expect(topBar.upNext).toHaveAttribute('aria-expanded', 'false')

    await topBar.upNext.click()
    const popover = topBar.upNextPopover
    await expect(popover).toBeVisible()
    await expect(topBar.upNext).toHaveAttribute('aria-expanded', 'true')
    // The next items, grouped by day, then what is due this week.
    await expect(popover.getByRole('region', { name: 'Today' }).getByTestId('up-next-item')).toHaveText([/Chemistry.*Class · 14:00-16:00/, /Cafe shift.*Shift · 17:00-22:00/])
    await expect(popover.getByRole('region', { name: 'Tomorrow' })).toBeVisible()
    await expect(popover.getByTestId('up-next-item')).toHaveCount(5)
    await expect(popover.getByRole('region', { name: 'Due this week' })).toContainText('Biology quiz')
    await expect(popover.getByRole('region', { name: 'Due this week' })).toContainText('Thu 10:00')
    await expect(popover.getByTestId('up-next-summary')).toContainText('of study booked for the rest of the week')
    await expect(popover.getByTestId('up-next-summary')).toContainText('not booked yet')
    await expect(popover.getByTestId('up-next-add-calendar')).toBeVisible()
    await expectTidyPopover(topBar)

    await popover.getByTestId('up-next-plan-week').click()
    // Still on this board, now with a Calendar, and Help me plan open on the week.
    await topBar.expectActiveWorkspace('My week')
    await expect(popover).toBeHidden()
    const calendar = new CalendarPom(page)
    await expect(calendar.root).toBeVisible()
    await expect(calendar.root.getByTestId('help-me-plan-panel')).toBeVisible()
    await expect(calendar.root.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    await expect(calendar.days).toHaveCount(7)
    await expect(new PanelGridPom(page).panels).toHaveCount(1)

    // With a Calendar on the board there is nothing to add.
    await topBar.upNext.click()
    await expect(topBar.upNextPopover.getByTestId('up-next-add-calendar')).toHaveCount(0)
    await expect(topBar.upNextPopover.getByTestId('up-next-plan-week')).toBeVisible()
  })

  test('Plan my week opened before the week loads places Help me plan where a reopen does, clear of the days left', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY)
    // The week's rows arrive late, so the panel opens before the grid is there.
    await page.route(/planItems\.list/, async (route) => {
      await new Promise((r) => setTimeout(r, 800))
      await route.continue()
    })
    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-plan-week').click()
    const calendar = new CalendarPom(page)
    const panel = calendar.root.locator('[data-placement]')
    await expect(panel.getByTestId('help-me-plan-panel')).toBeVisible()
    await expect(calendar.days).toHaveCount(7)
    await page.unrouteAll({ behavior: 'wait' })
    // Tuesday, with Monday too narrow for it: over the weekend, clear of
    // today and every weekday after it.
    await expect(panel).toHaveAttribute('data-placement', 'right')
    const friday = (await calendar.days.nth(4).boundingBox())!
    await expect.poll(async () => Math.round((await panel.boundingBox())!.x)).toBeGreaterThanOrEqual(Math.round(friday.x + friday.width) - 1)
    const first = (await panel.boundingBox())!
    // Opened again on the loaded week: the same place.
    await calendar.root.getByTestId('help-me-plan').click()
    await expect(panel).toHaveCount(0)
    await calendar.root.getByTestId('help-me-plan').click()
    await expect(panel).toHaveAttribute('data-placement', 'right')
    expect(await panel.boundingBox()).toEqual(first)
  })

  test('Add Calendar to this board adds only the Calendar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY)
    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-add-calendar').click()
    await expect(new CalendarPom(page).root).toBeVisible()
    await expect(topBar.upNextPopover).toBeHidden()
    await expect(new CalendarPom(page).root.getByTestId('help-me-plan-panel')).toHaveCount(0)
  })

  test('says "now" while an item is on, and "Plan your week" with nothing booked', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await reseed({ now: TUESDAY_AFTERNOON })
    await page.clock.setFixedTime(TUESDAY_AFTERNOON)
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await expect(topBar.upNext).toHaveText(/^Now: Chemistry$/)

    for (const item of await trpcQuery<{ id: string }[]>(request, 'planItems.list')) {
      await trpcMutation(request, 'planItems.delete', item.id)
    }
    await page.reload()
    await expect(topBar.upNext).toHaveText('Plan your week')
    await topBar.upNext.click()
    await expect(topBar.upNextPopover.getByTestId('up-next-empty')).toBeVisible()
    await expect(topBar.upNextPopover.getByTestId('up-next-plan-week')).toBeVisible()
  })

  test('focus moves in, Escape and a press outside close it, and focus returns to the button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY)

    await topBar.upNext.focus()
    await page.keyboard.press('Enter')
    await expect(topBar.upNextPopover).toBeFocused()
    // Tab reaches Close, then the actions, inside it.
    await page.keyboard.press('Tab')
    await expect(topBar.upNextPopover.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(topBar.upNextPopover).toBeHidden()
    await expect(topBar.upNext).toBeFocused()

    // The button toggles it.
    await topBar.upNext.click()
    await expect(topBar.upNextPopover).toBeVisible()
    await topBar.upNext.click()
    await expect(topBar.upNextPopover).toBeHidden()

    // A press outside closes it and does what it was aimed at.
    await topBar.upNext.click()
    await expect(topBar.upNextPopover).toBeVisible()
    await page.getByTestId('settings-button').click()
    await expect(topBar.upNextPopover).toBeHidden()
    await expect(page.getByTestId('settings-popover')).toBeVisible()
  })

  test('never takes the tabs\' room: at every width the active board name is whole, New board can be hit, and Up next is in the bar', async ({ page }) => {
    const topBar = await openBlankBoard(page, TUESDAY)
    for (const width of [640, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      // Let the bar settle after the resize.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))))
      const upNext = (await topBar.upNext.boundingBox())!
      expect(upNext.x, `${width}: Up next on screen`).toBeGreaterThanOrEqual(0)
      expect(upNext.x + upNext.width, `${width}: Up next on screen`).toBeLessThanOrEqual(width)
      // A name for a screen reader, whatever is drawn.
      await expect(topBar.upNext).toHaveAccessibleName(/Chemistry 14:00/)

      // The active board's name is not cut (the tabs keep their room).
      await topBar.workspaceTab('My week').scrollIntoViewIfNeeded()
      const cut = await topBar.workspaceTab('My week').evaluate((tab) => {
        const label = [...tab.querySelectorAll<HTMLElement>('*')].find((el) => el.children.length === 0 && el.textContent === 'My week') ?? tab
        return label.scrollWidth > label.clientWidth
      })
      expect(cut, `${width}: active tab name cut`).toBe(false)

      // Where the tabs all fit they are not squeezed into scrolling for Up next's sake.
      if (width >= 1024) {
        const room = await topBar.root.getByTestId('board-tabs').evaluate((el) => {
          const strip = el.querySelector<HTMLElement>('[aria-label="Boards"]') ?? el
          return strip.scrollWidth <= strip.clientWidth
        })
        expect(room, `${width}: all board tabs fit`).toBe(true)
      }

      // New board is reachable (the strip scrolls on a narrow bar): a click at its centre lands on it.
      await topBar.newWorkspaceButton.scrollIntoViewIfNeeded()
      const add = (await topBar.newWorkspaceButton.boundingBox())!
      const hit = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null,
        [add.x + add.width / 2, add.y + add.height / 2],
      )
      expect(hit, `${width}: New board hit`).toBe('New board')
    }
  })

  test('shows words where there is room, and only the icon where there is none', async ({ page }) => {
    const topBar = await openBlankBoard(page, TUESDAY)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(topBar.upNext).toContainText('Up next: Chemistry 14:00')
    expect((await topBar.upNext.boundingBox())!.width).toBeGreaterThan(150)
    // Crowd the bar: the label gives way before anything else does.
    await page.setViewportSize({ width: 640, height: 900 })
    await expect.poll(async () => (await topBar.upNext.boundingBox())!.width).toBeLessThanOrEqual(40)
  })

  test('"Plan your week" is words, not an icon, wherever the bar has room for them', async ({ page, request }) => {
    const topBar = await openBlankBoard(page, TUESDAY)
    for (const item of await trpcQuery<{ id: string }[]>(request, 'planItems.list')) {
      await trpcMutation(request, 'planItems.delete', item.id)
    }
    await page.reload()
    for (const width of [768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(topBar.upNext).toHaveAccessibleName(/Plan your week/)
      if (width >= 1024) await expect(topBar.upNext.getByTestId('up-next-label')).toHaveText('Plan your week')
      const box = (await topBar.upNext.boundingBox())!
      // Words wherever the bar leaves room (from 1024px with four boards open); the icon, still named, where it does not.
      expect(box.width > 120, `${width}: words`).toBe(width >= 1024)
    }
  })

  test('Tab out of either end of the popover closes it and puts focus back on the button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY)
    await topBar.upNext.click()
    await expect(topBar.upNextPopover).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(topBar.upNextPopover).toBeHidden()
    await expect(topBar.upNext).toBeFocused()

    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-add-calendar').focus()
    await page.keyboard.press('Tab')
    await expect(topBar.upNextPopover).toBeHidden()
    await expect(topBar.upNext).toBeFocused()
  })

  // A fresh page per size: reseeding under a page that is still open races its reload.
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    test(`is above the top bar and the board, and never off screen at ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size)
      const topBar = await openBlankBoard(page, TUESDAY)
      await expect(topBar.upNext).toBeVisible()
      await topBar.upNext.click()
      const box = (await topBar.upNextPopover.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(size.width)
      expect(box.y + box.height).toBeLessThanOrEqual(size.height)
      // What is under the popover's corners is the popover itself, not the bar or the board.
      const onTop = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="up-next-popover"]') != null, { x: box.x + 20, y: box.y + 20 })
      expect(onTop).toBe(true)
    })
  }
})

test.describe('Plan my week hand-off', () => {
  test.afterAll(async () => { await reseed() })

  const slowAdd = (page: Page, ms: number) =>
    page.route('**/workspaces.addPanel**', async (route) => {
      await new Promise((r) => setTimeout(r, ms))
      await route.continue()
    })

  test('a second press while the Calendar is being added does not add another', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY)
    await slowAdd(page, 1200)
    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-plan-week').click()
    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-plan-week').click()
    const calendar = new CalendarPom(page)
    await expect(calendar.root).toBeVisible()
    await expect(calendar.root.getByTestId('help-me-plan-panel')).toBeVisible()
    await expect(new PanelGridPom(page).panels).toHaveCount(1)
  })

  test('leaving the board while the Calendar is added sends Help me plan nowhere else', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY, async () => {
      const other = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Other week' })
      await trpcMutation(request, 'workspaces.addPanel', {
        workspaceId: other.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 900, height: 640,
      })
    })
    await slowAdd(page, 1500)
    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-plan-week').click()
    await topBar.switchToWorkspace('Other week')
    const calendar = new CalendarPom(page)
    await expect(calendar.root).toBeVisible()
    // Wait out the slow add, then check the other board's Calendar was left alone.
    await page.waitForTimeout(2200)
    await expect(calendar.root.getByTestId('help-me-plan-panel')).toHaveCount(0)
    // Back on its own board the Calendar is there and Help me plan opens on it.
    await topBar.switchToWorkspace('My week')
    await expect(new CalendarPom(page).root.getByTestId('help-me-plan-panel')).toBeVisible()
  })

  test('a Calendar that failed to add leaves nothing waiting to open Help me plan later', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const topBar = await openBlankBoard(page, TUESDAY)
    await page.route('**/workspaces.addPanel**', (route) => route.abort())
    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-plan-week').click()
    await expect(page.getByTestId('toast').filter({ hasText: "Couldn't add Calendar" })).toBeVisible()
    await page.unroute('**/workspaces.addPanel**')
    // Adding a Calendar by hand now must not open Help me plan.
    await topBar.upNext.click()
    await topBar.upNextPopover.getByTestId('up-next-add-calendar').click()
    const calendar = new CalendarPom(page)
    await expect(calendar.root).toBeVisible()
    await expect(calendar.root.getByTestId('help-me-plan-panel')).toHaveCount(0)
  })
})

test.describe('Up next on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test.afterAll(async () => { await reseed() })

  test('is in the bar, whole and on screen; Plan my week opens Help me plan in Week view', async ({ page }) => {
    const topBar = await openBlankBoard(page, TUESDAY)
    await expect(topBar.root).toHaveAttribute('data-layout', 'phone')
    await expect(topBar.upNext).toContainText('Chemistry')
    const button = (await topBar.upNext.boundingBox())!
    expect(button.x).toBeGreaterThanOrEqual(0)
    expect(button.x + button.width).toBeLessThanOrEqual(390)
    expect(button.height).toBeGreaterThanOrEqual(36)

    await topBar.upNext.tap()
    const box = (await topBar.upNextPopover.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await expectTidyPopover(topBar)

    await topBar.upNextPopover.getByTestId('up-next-plan-week').tap()
    await topBar.expectActiveWorkspace('My week')
    const calendar = new CalendarPom(page)
    // A phone opens Day view, which has no Help me plan: it is forced to Week.
    await expect(calendar.root.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    await expect(calendar.root.getByTestId('help-me-plan-panel')).toBeVisible()
  })

  test('on a short phone (375x667) the popover stays on screen and Plan my week is still reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const topBar = await openBlankBoard(page, TUESDAY)
    await topBar.upNext.tap()
    const box = (await topBar.upNextPopover.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(667)
    // The popover scrolls within itself; the action is one tap away.
    await topBar.upNextPopover.getByTestId('up-next-plan-week').tap()
    await expect(new CalendarPom(page).root.getByTestId('help-me-plan-panel')).toBeVisible()
  })
})
