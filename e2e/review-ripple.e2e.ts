import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { startOfLocalDay } from '../packages/scheduler/src'
import type { PlanItemOccurrence } from '../packages/substrate/src'
import { CalendarPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
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

/**
 * The demo board after step 4 (docs/demo-runbook.md) at 1440x900: Calendar
 * at the top left, To-do and Coming up beside it, the Transcript below the
 * Calendar (where adding it lands on a full board), so the Calendar's morning
 * is off screen while the moment is on. Busy from 10:00 every day of the
 * review window, so a new review lands at 09:00, in that morning, as in the
 * rehearsal (Fri 09:00), whatever the time now.
 */
async function demoLikeBoard(request: APIRequestContext, { calendar = true } = {}) {
  const now = Date.now()
  for (let day = 0; day < 4; day++) {
    await trpcMutation(request, 'planItems.create', {
      kind: 'commitment', title: 'Busy', subtype: 'other',
      starts_at: new Date(startOfLocalDay(now, TZ, day) + 10 * 3_600_000).toISOString(),
      ends_at: new Date(startOfLocalDay(now, TZ, day + 1)).toISOString(),
    })
  }
  const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'My week' })
  const panels = [
    { lensType: 'calendar', pos_x: 20, pos_y: 20, width: 900, height: 760 },
    { lensType: 'todo', pos_x: 940, pos_y: 20, width: 360, height: 440 },
    { lensType: 'coming-up', pos_x: 940, pos_y: 480, width: 360, height: 320 },
    { lensType: 'transcript', pos_x: 420, pos_y: 800, width: 420, height: 380 },
  ]
  for (const p of panels.filter((panel) => calendar || panel.lensType !== 'calendar')) {
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: board.id, slotName: p.lensType, ...p })
  }
  await trpcMutation(request, 'workspaces.setScope', { workspaceId: board.id, scopeType: 'tag', scopeValue: 'biology' })
  await trpcMutation(request, 'workspaces.setScope', { workspaceId: board.id, scopeType: 'recording', scopeValue: 'rec-bio-4' })
}

const MOMENT = /Mitochondrial mutations accumulate/
const MOMENT_MS = 1_080_000

/** An element's scrollTop once it has stopped moving. */
async function settledScrollTop(scroller: Locator, everyMs = 150): Promise<number> {
  let last = -1
  await expect.poll(async () => {
    const now = await scroller.evaluate((el) => el.scrollTop)
    const same = now === last
    last = now
    return same
  }, { intervals: [everyMs] }).toBe(true)
  return last
}

/**
 * Opens the demo-like board scrolled down to its Transcript, with the moment
 * part-scrolled out of the top of the list (as in the rehearsal), and selects
 * it by clicking the part still showing.
 */
async function selectMomentHalfScrolled(page: Page, { withCalendar = true } = {}) {
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace('My week')
  const grid = new PanelGridPom(page)
  const transcript = grid.panelByLabel('Transcript')
  const calendar = new CalendarPom(page)
  await expect(transcript.getByText('14 segments')).toBeVisible({ timeout: 10000 })
  if (withCalendar) await expect(calendar.block('Cafe shift').first()).toBeVisible({ timeout: 10000 })
  else await expect(grid.panelByLabel('To-do').getByTestId('todo-item').first()).toBeVisible({ timeout: 10000 })
  // The board at its bottom: the Transcript on screen, the Calendar's morning not.
  await grid.root.evaluate((el) => { el.scrollTop = el.scrollHeight })
  await settledScrollTop(grid.root)
  const moment = transcript.locator('[data-segment-id]').filter({ hasText: MOMENT })
  const list = await moment.evaluate((el) => {
    const l = el.parentElement!
    l.scrollTop = el.offsetTop + 20
    const r = l.getBoundingClientRect()
    return { top: r.top, left: r.left, width: r.width }
  })
  await page.mouse.click(list.left + list.width / 2, list.top + 10)
  await expect(transcript.getByRole('button', { name: 'confused', exact: true })).toBeVisible()
  return { transcript, moment, calendar, grid }
}

/**
 * The chip is scrolled into view in the transcript list (the tag bar under
 * the list no longer hides it). Whether it is also on screen with the block
 * depends on whether both fit; the block wins (see `boardScrollFor`).
 */
async function expectChipShownInList(chip: Locator) {
  await expectShownInList(chip)
}

/** Shown in full in the scrolling list it is in (the transcript, the To-do list). */
async function expectShownInList(el: Locator) {
  await expect.poll(() => el.evaluate((node) => {
    const r = node.getBoundingClientRect()
    let list = node.parentElement
    while (list && !['auto', 'scroll'].includes(getComputedStyle(list).overflowY)) list = list.parentElement
    const l = list!.getBoundingClientRect()
    return r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5
  })).toBe(true)
}

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** Starts recording the lift-off card's box every frame (it lives about a second). */
async function recordCard(page: Page) {
  await page.evaluate(() => {
    type Rec = { first: DOMRect | null; last: DOMRect | null; list: DOMRect | null; done: boolean }
    const w = window as unknown as { card: Rec }
    w.card = { first: null, last: null, list: null, done: false }
    const tick = () => {
      const el = document.querySelector('[data-testid="review-lift-off"]')
      if (el) {
        const r = el.getBoundingClientRect().toJSON()
        if (!w.card.first) {
          w.card.first = r
          w.card.list = document.querySelector('[data-segment-id]')!.parentElement!.getBoundingClientRect().toJSON()
        }
        w.card.last = r
      } else if (w.card.first) {
        w.card.done = true
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** The card's first and last boxes, once it has gone. */
async function recordedCard(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { card: { done: boolean } }).card.done), { timeout: 10000 }).toBe(true)
  const { first, last, list } = await page.evaluate(() => (window as unknown as { card: { first: DOMRect; last: DOMRect; list: DOMRect } }).card)
  const box = (r: DOMRect) => ({ ...r, x: r.left, y: r.top })
  return { first: box(first), last: box(last), list: box(list) }
}

/** The review the student just made from the seeded lecture. */
async function newReview(request: APIRequestContext, since: number): Promise<PlanItemOccurrence> {
  let review: PlanItemOccurrence | undefined
  await expect.poll(async () => {
    review = (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: 'rec-bio-4', kinds: ['task'], statuses: ['open'],
    })).find((r) => Date.parse(r.created_at) >= since - 1000)
    return !!review
  }, { timeout: 20000 }).toBe(true)
  // From the moment the test meant to mark, at 09:00 (see demoLikeBoard).
  expect(review!.source_offset_ms).toBe(MOMENT_MS)
  expect(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(Date.parse(review!.starts_at!))).toBe('09:00')
  return review!
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
    // The card would be drawn over the page, outside the widget.
    await recordAppearances(page.locator('body'), 'review-lift-off')

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

  test('on the demo board the board follows the review to its block, from the visible moment, keeping the chip in view', async ({ page, request }) => {
    await demoLikeBoard(request)
    const { transcript, moment, calendar, grid } = await selectMomentHalfScrolled(page)
    await recordCard(page)
    const boardBefore = await grid.root.evaluate((el) => el.scrollTop)

    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const review = await newReview(request, markedAt)
    const chip = moment.getByTestId('review-chip')
    await expect(chip).toContainText('Review planned · ')

    // It lands on the block, which glows: the board has scrolled up to it,
    // inside the board's visible area (not under the top bar or the toast bar).
    const block = calendar.root.locator(`[data-plan-item-id="${review.id}"]`)
    await expect(block).toHaveAttribute('data-revealed', 'true')
    await expect(page.getByTestId('review-lift-off')).toHaveCount(0)
    expect(await grid.root.evaluate((el) => el.scrollTop)).toBeLessThan(boardBefore)
    await expect(block).toBeInViewport({ ratio: 1 })
    const board = (await grid.root.boundingBox())!
    const landed = (await block.boundingBox())!
    expect(landed.y).toBeGreaterThanOrEqual(board.y)
    expect(landed.y + landed.height).toBeLessThanOrEqual(board.y + board.height)
    await expectChipShownInList(chip)

    // The card lifted off the part of the moment on screen (inside the list,
    // never over the widget's header) and, though the board moved under it,
    // came down on the block.
    const card = await recordedCard(page)
    expect(card.first.top).toBeGreaterThanOrEqual(card.list.top - 1)
    expect(card.first.top).toBeLessThan(card.list.bottom)
    expect(overlaps(card.last, landed)).toBe(true)

    // The 20-min block is only a few pixels tall: it glows in a halo of readable size, centred on it.
    const halo = (await block.getByTestId('calendar-reveal-halo').boundingBox())!
    expect(halo.height).toBeGreaterThanOrEqual(22)
    expect(Math.abs(halo.y + halo.height / 2 - (landed.y + landed.height / 2))).toBeLessThan(1.5)

    // The new To-do row shows in full in its list.
    await expectShownInList(grid.panelByLabel('To-do').locator(`[data-plan-item-id="${review.id}"]`))
  })

  test('a scroll of the board while it glides to the block stops the glide, and the scroll takes', async ({ page, request }) => {
    await demoLikeBoard(request)
    const { transcript, calendar, grid } = await selectMomentHalfScrolled(page)
    await grid.root.evaluate((board) => {
      const w = window as unknown as { glide: { at: number; top: number }[]; wheelAt: number | null }
      w.glide = []
      w.wheelAt = null
      board.addEventListener('scroll', () => w.glide.push({ at: performance.now(), top: board.scrollTop }))
      document.addEventListener('wheel', () => { w.wheelAt ??= performance.now() }, { capture: true })
    })
    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    // As soon as the board starts gliding up to the block, the student scrolls it up further, past it.
    await expect.poll(() => page.evaluate(() => (window as unknown as { glide: unknown[] }).glide.length), { intervals: [5], timeout: 15000 }).toBeGreaterThan(0)
    await page.mouse.move(1380, 600)
    await page.mouse.wheel(0, -300)
    const final = await settledScrollTop(grid.root)
    const review = await newReview(request, markedAt)
    await expect(calendar.root.locator(`[data-plan-item-id="${review.id}"]`)).toHaveAttribute('data-revealed', 'true')
    const { glide, wheelAt } = await page.evaluate(() => {
      const w = window as unknown as { glide: { at: number; top: number }[]; wheelAt: number }
      return { glide: w.glide, wheelAt: w.wheelAt }
    })
    // The wheel came while the glide was under way...
    expect(wheelAt - glide[0].at).toBeLessThan(150)
    const atWheel = glide.filter((g) => g.at <= wheelAt).at(-1)!.top
    // ...and moved the board its 300px from where it was then (once, not
    // lost to the glide, which would have stopped about 170px up).
    expect(final).toBeLessThan(atWheel - 250)
    expect(final).toBeGreaterThan(atWheel - 350)
    expect(await grid.root.evaluate((el) => el.scrollTop)).toBe(final)
  })

  test('a scroll just after the glide has stopped moves the board once, by its own amount', async ({ page, request }) => {
    await demoLikeBoard(request)
    const { transcript, calendar, grid } = await selectMomentHalfScrolled(page)
    await grid.root.evaluate((board) => {
      const w = window as unknown as { glideAt: number | null; wheelAt: number | null }
      w.glideAt = null
      w.wheelAt = null
      board.addEventListener('scroll', () => { w.glideAt ??= performance.now() })
      document.addEventListener('wheel', () => { w.wheelAt ??= performance.now() }, { capture: true })
    })
    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { glideAt: number | null }).glideAt), { intervals: [10], timeout: 15000 }).not.toBeNull()
    // The board has followed the review and stopped; straight away the student scrolls it down 100px.
    const stopped = await settledScrollTop(grid.root, 50)
    await page.mouse.move(1380, 600)
    await page.mouse.wheel(0, 100)
    expect(await settledScrollTop(grid.root)).toBe(stopped + 100)
    const { glideAt, wheelAt } = await page.evaluate(() => {
      const w = window as unknown as { glideAt: number; wheelAt: number }
      return { glideAt: w.glideAt, wheelAt: w.wheelAt }
    })
    // Within a second of the glide starting, while a stopped glide could still be mistaken for a running one.
    expect(wheelAt - glideAt).toBeLessThan(900)
    const review = await newReview(request, markedAt)
    await expect(calendar.root.locator(`[data-plan-item-id="${review.id}"]`)).toHaveAttribute('data-revealed', 'true')
  })

  test('with no Calendar on the board, a scheduled review is followed to its To-do row', async ({ page, request }) => {
    await demoLikeBoard(request, { calendar: false })
    const { transcript, grid } = await selectMomentHalfScrolled(page, { withCalendar: false })
    await recordCard(page)
    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const review = await newReview(request, markedAt)
    const row = grid.panelByLabel('To-do').locator(`[data-plan-item-id="${review.id}"]`)
    await expect(row).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as unknown as { card: { done: boolean } }).card.done), { timeout: 10000 }).toBe(true)
    await expect(row).toBeInViewport({ ratio: 1 })
    await expectShownInList(row)
    // The card flew to the row, not into empty board.
    const card = await recordedCard(page)
    expect(overlaps(card.last, (await row.boundingBox())!)).toBe(true)
  })

  test('a moment scrolled off screen before its review arrives: the card still starts on screen', async ({ page, request }) => {
    await demoLikeBoard(request)
    const { transcript, calendar, grid } = await selectMomentHalfScrolled(page)
    await recordCard(page)
    // The new review reaches the page only once the student has finished scrolling.
    let release = () => {}
    const scrolled = new Promise<void>((resolve) => { release = resolve })
    await page.route((url) => url.pathname.includes('planItems.list'), async (route) => { await scrolled; await route.continue() })
    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    // The student scrolls the board up to the top straight away: the Transcript goes off screen, and the board stays there.
    await page.mouse.move(1380, 600)
    await page.mouse.wheel(0, -2000)
    await expect.poll(() => grid.root.evaluate((el) => el.scrollTop)).toBe(0)
    await settledScrollTop(grid.root)
    release()
    const review = await newReview(request, markedAt)
    await expect(calendar.root.locator(`[data-plan-item-id="${review.id}"]`)).toHaveAttribute('data-revealed', 'true')
    await expect.poll(() => page.evaluate(() => (window as unknown as { card: { done: boolean } }).card.done), { timeout: 10000 }).toBe(true)
    expect(await grid.root.evaluate((el) => el.scrollTop)).toBe(0)
    const card = await recordedCard(page)
    const board = (await grid.root.boundingBox())!
    expect(card.first.top).toBeGreaterThanOrEqual(board.y - 1)
    expect(card.first.bottom).toBeLessThanOrEqual(board.y + board.height + 1)
  })

  test('when the block and the moment both fit on screen, the board shows both', async ({ page, request }) => {
    // 100px taller than the demo screen: a 09:00 block and the chip under the moment just fit together.
    await page.setViewportSize({ width: 1440, height: 1000 })
    await demoLikeBoard(request)
    const { transcript, moment, calendar } = await selectMomentHalfScrolled(page)
    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const review = await newReview(request, markedAt)
    const block = calendar.root.locator(`[data-plan-item-id="${review.id}"]`)
    await expect(block).toHaveAttribute('data-revealed', 'true')
    await expect(page.getByTestId('review-lift-off')).toHaveCount(0)
    await expect(block).toBeInViewport({ ratio: 1 })
    await expect(moment.getByTestId('review-chip')).toBeInViewport({ ratio: 1 })
  })

  test('on the demo board under reduced motion the board jumps to the block, with no card', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await demoLikeBoard(request)
    const { transcript, moment, calendar, grid } = await selectMomentHalfScrolled(page)
    await recordAppearances(page.locator('body'), 'review-lift-off')
    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const review = await newReview(request, markedAt)
    const block = calendar.root.locator(`[data-plan-item-id="${review.id}"]`)
    // Revealed straight away (no card on its way), with a still ring.
    await expect(block).toHaveAttribute('data-revealed', 'true')
    await expect(block).toHaveCSS('animation-name', 'none')
    await expect(block).toBeInViewport({ ratio: 1 })
    await expectChipShownInList(moment.getByTestId('review-chip'))
    // A jump, not a glide: the board is already where it ends up.
    const top = await grid.root.evaluate((el) => el.scrollTop)
    await page.waitForTimeout(500)
    expect(await grid.root.evaluate((el) => el.scrollTop)).toBe(top)
    expect(await page.evaluate(() => [...(window as unknown as { seen: Set<string> }).seen])).toEqual([])
  })

  test('scrolling the board during the ripple wins: the board stays where the student put it', async ({ page, request }) => {
    await demoLikeBoard(request)
    const { transcript, moment, calendar, grid } = await selectMomentHalfScrolled(page)
    const markedAt = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    // Straight away, the student scrolls the board up a little themselves, over empty board.
    await page.mouse.move(1380, 600)
    await page.mouse.wheel(0, -60)
    const settled = await settledScrollTop(grid.root)
    const review = await newReview(request, markedAt)
    await expect(moment.getByTestId('review-chip')).toContainText('Review planned · ')
    // The ripple still runs to the end, but never moves the board.
    await expect(calendar.root.locator(`[data-plan-item-id="${review.id}"]`)).toHaveAttribute('data-revealed', 'true')
    await expect(page.getByTestId('review-lift-off')).toHaveCount(0)
    expect(await grid.root.evaluate((el) => el.scrollTop)).toBe(settled)
  })

  test('"See it" shows the block with the morning around it, not the night before', async ({ page, request }) => {
    // A review at 09:00 tomorrow: the grid shows it from 08:00, never from 04:00.
    const tomorrow = startOfLocalDay(Date.now(), TZ, 1)
    const at = (h: number, m = 0) => new Date(tomorrow + (h * 60 + m) * 60_000).toISOString()
    const review = await trpcMutation<{ id: string }>(request, 'planItems.create', {
      kind: 'task', title: 'Review: chloroplast DNA', starts_at: at(9), ends_at: at(9, 20), duration_min: 20,
      course: 'biology', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: MOMENT_MS,
    })
    await demoLikeBoard(request)
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    const scroller = calendar.root.getByTestId('calendar-scroll')
    await expect(calendar.block('Cafe shift').first()).toBeVisible({ timeout: 10000 })
    // The student had scrolled the grid down to the evening first.
    await scroller.hover()
    await page.mouse.wheel(0, 2000)
    await expect(calendar.root.getByText('08:00', { exact: true })).not.toBeInViewport()
    const chip = new PanelGridPom(page).panelByLabel('Transcript')
      .locator('[data-segment-id]').filter({ hasText: MOMENT }).getByTestId('review-chip')
    await chip.click()
    const block = calendar.root.locator(`[data-plan-item-id="${review.id}"]`)
    await expect(block).toHaveAttribute('data-revealed', 'true')
    await expect(block).toBeInViewport({ ratio: 1 })
    // Settled: 08:00 is the top hour on show, context above 09:00, and no night hours.
    await settledScrollTop(scroller)
    const view = (await scroller.boundingBox())!
    const label = async (text: string) => (await calendar.root.getByText(text, { exact: true }).boundingBox())!
    const eight = await label('08:00')
    expect(eight.y + eight.height / 2).toBeGreaterThanOrEqual(view.y)
    const seven = await label('07:00')
    expect(seven.y + seven.height / 2).toBeLessThan(view.y)
    // The callout gives way to the popover the block opens.
    await expect(calendar.root.getByTestId('calendar-reveal')).toBeVisible()
    await block.click()
    await expect(calendar.popover).toBeVisible()
    await expect(calendar.root.getByTestId('calendar-reveal')).toHaveCount(0)
  })

  test('a review that finds no time goes to the To-do list, and says so', async ({ page, request }) => {
    // Away for the whole window (today and the next 3 days): no free time at all.
    const now = Date.now()
    await trpcMutation(request, 'planItems.create', {
      kind: 'commitment', title: 'Field trip', subtype: 'other',
      starts_at: new Date(startOfLocalDay(now, TZ)).toISOString(), ends_at: new Date(startOfLocalDay(now, TZ, 4)).toISOString(),
    })
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
    await expect(transcript.getByText('14 segments')).toBeVisible({ timeout: 10000 })
    await page.locator('body').evaluate((el) => {
      const w = window as unknown as { liftOff: string[] }
      w.liftOff = []
      new MutationObserver(() => {
        const card = el.querySelector('[data-testid="review-lift-off"]')
        if (card?.textContent && !w.liftOff.includes(card.textContent)) w.liftOff.push(card.textContent)
      }).observe(el, { subtree: true, childList: true })
    })
    const moment = transcript.locator('[data-segment-id]').filter({ hasText: /Today we're continuing our discussion/ })
    await moment.getByText(/Today we're continuing our discussion/).click()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()

    const chip = moment.getByTestId('review-chip')
    await expect(chip).toContainText('Review on your to-do list', { timeout: 20000 })
    const toast = page.getByTestId('toast-host')
    await expect(toast).toContainText('Review added to your to-do list')
    await expect(toast.getByRole('button', { name: 'See it' })).toHaveCount(0)
    // The board follows it to its new To-do row.
    await expect(grid.panelByLabel('To-do').getByTestId('todo-item').filter({ hasText: 'Review: ' })).toBeInViewport({ ratio: 1 })
    await expect.poll(() => page.evaluate(() => (window as unknown as { liftOff: string[] }).liftOff.join(' | ')))
      .toContain('Adding to your to-do list')
    expect(await page.evaluate(() => (window as unknown as { liftOff: string[] }).liftOff.join(' | '))).not.toContain('Adding to your plan')
  })
})
