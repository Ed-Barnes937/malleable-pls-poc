import { test, expect, type Locator } from '@playwright/test'
import { startOfLocalDay } from '../packages/scheduler/src'
import type { PlanItemOccurrence } from '../packages/substrate/src'
import { PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcQuery } from './api'
import { reseed } from './reseed'
import { expectedReviewSlots } from './review-placement'

const TZ = 'Europe/London'

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: TZ })

/** Notes whether a test id ever appears under `root` (a short-lived element is easy to miss by polling). */
async function recordAppearances(root: Locator, testId: string) {
  await root.evaluate((el, id) => {
    const w = window as unknown as { seen: Set<string> }
    w.seen = new Set()
    new MutationObserver(() => {
      if (el.querySelector(`[data-testid="${id}"]`)) w.seen.add(id)
    }).observe(el, { subtree: true, childList: true })
  }, testId)
}

test.describe('The confused-to-calendar ripple', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('with reduced motion: the review lands earliest, the chip and "See it" reveal it, nothing animates', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    await sidebar.addWidget('Calendar')
    await sidebar.addWidget('To-do')
    await page.keyboard.press('Escape')

    const transcript = grid.panelByLabel('Transcript')
    const calendar = grid.panelByLabel('Calendar')
    await expect(transcript.getByText('14 segments')).toBeVisible({ timeout: 10000 })
    await recordAppearances(transcript, 'review-lift-off')

    const moment = transcript.locator('[data-segment-id]').filter({ hasText: /Today we're continuing our discussion/ })
    await moment.getByText(/Today we're continuing our discussion/).click()
    const markedFrom = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const chip = moment.getByTestId('review-chip')
    await expect(chip).toContainText('Review planned · ', { timeout: 20000 })
    const markedTo = Date.now()

    const [review] = (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', kinds: ['task'], statuses: ['open'],
    })).filter((r) => Date.parse(r.created_at) >= markedFrom - 1000)
    expect(review).toBeTruthy()
    const expected = await expectedReviewSlots(
      request,
      { id: review.id, durationMin: review.duration_min!, latest: startOfLocalDay(markedFrom, TZ, 4) },
      { from: markedFrom, to: markedTo },
      TZ,
    )
    expect(expected.map((slot) => slot?.start)).toContain(Date.parse(review.starts_at!))

    // The toast offers "See it": the calendar opens the block's week and
    // marks it with a still ring (no glow, no lift-off, no slide).
    const toast = page.getByTestId('toast-host')
    await expect(toast).toContainText('Review added to your plan')
    await toast.getByRole('button', { name: 'See it' }).click()
    const block = calendar.getByTestId('calendar-block').filter({ hasText: review.title })
    await expect(block).toHaveAttribute('data-revealed', 'true')
    await expect(block).toBeInViewport()
    await expect(block).toHaveCSS('animation-name', 'none')
    await expect(calendar.getByTestId('calendar-reveal')).toContainText(review.title)
    expect(await page.evaluate(() => [...(window as unknown as { seen: Set<string> }).seen])).toEqual([])
    const row = grid.panelByLabel('To-do').getByTestId('todo-item').filter({ hasText: review.title })
    await expect(row).toHaveCSS('animation-name', 'none')

    // Once it settles, the chip on the moment reveals it again.
    await expect(block).not.toHaveAttribute('data-revealed', 'true', { timeout: 6000 })
    await chip.click()
    await expect(block).toHaveAttribute('data-revealed', 'true')
  })
})
