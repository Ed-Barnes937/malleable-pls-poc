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

async function openBlankBoard(page: Page, now: Date) {
  await reseed({ now })
  await page.clock.setFixedTime(now)
  await page.goto('/')
  const topBar = new TopBarPom(page)
  await topBar.openCreateWorkspaceDialog()
  await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
  await topBar.expectActiveWorkspace('My week')
  await new PanelGridPom(page).expectEmpty()
  return topBar
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
    await expect(topBar.upNext).toContainText('Up next: Chemistry now')

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

  test('is in the bar at every width, as words where there is room and an icon where there is not', async ({ page }) => {
    const topBar = await openBlankBoard(page, TUESDAY)
    for (const width of [640, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const box = (await topBar.upNext.boundingBox())!
      expect(box.x, `${width}: on screen`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${width}: on screen`).toBeLessThanOrEqual(width)
      // A name for a screen reader, whatever is drawn.
      await expect(topBar.upNext).toHaveAccessibleName(/Up next: Chemistry 14:00|Chemistry 14:00/)
      const words = width >= 1024
      expect(box.width > 40, `${width}: ${words ? 'words' : 'icon'}`).toBe(words)
    }
  })

  test('is above the top bar and the board, and never off screen', async ({ page }) => {
    for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
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
      await page.keyboard.press('Escape')
    }
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

    await topBar.upNextPopover.getByTestId('up-next-plan-week').tap()
    await topBar.expectActiveWorkspace('My week')
    const calendar = new CalendarPom(page)
    // A phone opens Day view, which has no Help me plan: it is forced to Week.
    await expect(calendar.root.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    await expect(calendar.root.getByTestId('help-me-plan-panel')).toBeVisible()
  })
})
