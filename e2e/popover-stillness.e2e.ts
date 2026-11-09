import { test, expect } from './test'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { untilFontsLoaded } from './fonts'
import { trpcMutation } from './api'
import { startOfLocalDay } from '../packages/scheduler/src'
import { SEED_TIME_ZONE } from './seed-week'

/**
 * A study block's popover opens before the lecture it came from has loaded
 * (its title, the line it quotes, its mark), and what arrives, or turns out
 * to be missing, changes its size. The buttons must not move while it does:
 * a finger is already on its way to one. Held requests make the wait certain;
 * the block's hour varies where the popover is placed (above the block,
 * below it, beside it), as the growth is taken up differently by each.
 */

const HOURS = [8, 12, 16, 20]
const SCENARIOS = [
  { name: 'the lecture and its line load into it', sourceId: 'rec-bio-4', offsetMs: 2_200_000, arrives: /chloroplast DNA/ },
  { name: 'the lecture is missing (nothing to load, the line collapses)', sourceId: 'rec-gone', offsetMs: 0, arrives: null },
]
const VIEWPORTS = [
  { name: 'phone', size: { width: 400, height: 860 }, touch: true },
  { name: 'desktop', size: { width: 1280, height: 800 }, touch: false },
]

/**
 * Where an element is once it has stopped moving (the grid is still
 * scrolling it into view just after), in the web font (see ./fonts.ts).
 */
async function settledBox(page: Page, el: Locator) {
  await untilFontsLoaded(page)
  let last = ''
  await expect.poll(async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const now = JSON.stringify(await el.boundingBox())
    const same = now === last
    last = now
    return same
  }).toBe(true)
  return JSON.parse(last) as { x: number; y: number; width: number; height: number }
}

async function boardWithCalendar(request: APIRequestContext, height = 640) {
  const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'My week' })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: board.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 900, height,
  })
}

for (const viewport of VIEWPORTS) {
  test.describe(`Study block popover stillness on ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch })
    test.beforeEach(async ({ request }) => {
      await reseed()
      await boardWithCalendar(request)
    })

    for (const scenario of SCENARIOS) {
      for (const hour of HOURS) {
        test(`${hour}:00 block: Mark done stays where it is while ${scenario.name}`, async ({ page, request }) => {
          const today = new Date()
          const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour)
          await trpcMutation(request, 'planItems.create', {
            kind: 'task', title: 'Tap then wait', course: 'biology', duration_min: 60,
            starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString(),
            source_type: 'recording', source_id: scenario.sourceId, source_offset_ms: scenario.offsetMs,
          })
          await page.goto('/')
          await new TopBarPom(page).switchToWorkspace('My week')
          const calendar = new CalendarPom(page)
          const block = calendar.block('Tap then wait')
          await block.scrollIntoViewIfNeeded()

          // The lecture's requests are held from here (not from the page load:
          // tRPC batches requests, so a held one would hold the calendar's own).
          let release!: () => void
          const held = new Promise<void>((resolve) => { release = resolve })
          await page.route(/recordings\.byId|transcripts\.byRecording|tags\.list/, async (route) => {
            await held
            await route.continue()
          })
          const box = await settledBox(page, block)
          const at = { x: box.x + box.width / 2, y: box.y + Math.min(10, box.height / 2) }
          if (viewport.touch) await page.touchscreen.tap(at.x, at.y)
          else await page.mouse.click(at.x, at.y)

          const markDone = calendar.popover.getByRole('button', { name: 'Mark done' })
          await expect(markDone).toBeVisible()
          await expect(calendar.popover.getByTestId('calendar-moment-quote')).toBeVisible()
          await untilFontsLoaded(page)
          const before = (await markDone.boundingBox())!

          release()
          if (scenario.arrives) await expect(calendar.popover.getByText(scenario.arrives)).toBeVisible()
          else await expect(calendar.popover.getByTestId('calendar-moment-quote')).toHaveCount(0)
          // Let any re-placement the arrival caused be painted before looking.
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          expect(await markDone.boundingBox()).toEqual(before)
        })
      }
    }
  })
}

/**
 * A class's popover opens at once and the lecture it focuses arrives later
 * (and, with it, the boards that can show it, or the quiet "Add a widget"):
 * the row above its buttons changes while the student's finger is on its way.
 * Its primary action row is the anchor, so it must not move, whether the
 * lecture is found or the focus fails.
 */
const CLASS_OUTCOMES = [
  { name: 'the lecture is found', fails: false },
  { name: 'the focus fails', fails: true },
]

// Tall enough (the calendar and the window) that a popover isn't pinned to
// the calendar's bottom edge, where nothing above its buttons could move them.
const CLASS_VIEWPORTS = VIEWPORTS.map((v) => ({ ...v, size: { ...v.size, height: 1300 } }))

for (const viewport of CLASS_VIEWPORTS) {
  test.describe(`Class popover stillness on ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch })
    test.beforeEach(async ({ request }) => {
      await reseed()
      await boardWithCalendar(request, 1000)
    })

    for (const outcome of CLASS_OUTCOMES) {
      for (const hour of HOURS) {
        test(`${hour}:00 class: its buttons stay where they are while ${outcome.name}`, async ({ page, request, consoleErrors }) => {
          if (outcome.fails) consoleErrors.allowFailedRequest('lectures.forClassOccurrence')
          const start = startOfLocalDay(Date.now(), SEED_TIME_ZONE) + hour * 3_600_000
          await trpcMutation(request, 'planItems.create', {
            kind: 'commitment', title: 'Tap then wait', subtype: 'class', course: 'biology',
            starts_at: new Date(start).toISOString(), ends_at: new Date(start + 3_600_000).toISOString(),
            timeZone: SEED_TIME_ZONE,
          })
          // The board summary (which boards can show a lecture) and the focus
          // answer arrive after the popover is open. The summary is fetched with
          // the page's first batch, so that batch's answer to it is made an
          // error; the retry is its own request, held with the focus.
          let release!: () => void
          const held = new Promise<void>((resolve) => { release = resolve })
          let summaryFailed = false
          await page.route(/lectures\.forClassOccurrence|workspaces\.summary/, async (route) => {
            const url = new URL(route.request().url())
            const paths = decodeURIComponent(url.pathname).replace(/^\//, '').split(',')
            if (paths.includes('lectures.forClassOccurrence')) {
              await held
              if (outcome.fails) return route.abort()
              return route.continue()
            }
            if (paths.length === 1) {
              await held
              return route.continue()
            }
            if (summaryFailed) return route.continue()
            summaryFailed = true
            const response = await route.fetch()
            const body = (await response.json()) as unknown[]
            body[paths.indexOf('workspaces.summary')] = {
              error: { json: { message: 'held back', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } } },
            }
            await route.fulfill({ response, json: body })
          })
          await page.goto('/')
          await new TopBarPom(page).switchToWorkspace('My week')
          const calendar = new CalendarPom(page)
          const block = calendar.block('Tap then wait')
          await block.scrollIntoViewIfNeeded()
          const box = await settledBox(page, block)
          const at = { x: box.x + box.width / 2, y: box.y + Math.min(10, box.height / 2) }
          if (viewport.touch) await page.touchscreen.tap(at.x, at.y)
          else await page.mouse.click(at.x, at.y)

          const row = calendar.popover.getByRole('button', { name: 'Save' })
          await expect(calendar.popover.getByTestId('class-lecture')).toBeVisible()
          await expect(calendar.popover.getByTestId('class-lecture-status')).toHaveAttribute('data-state', 'pending')
          const before = await settledBox(page, row)

          release()
          await expect(calendar.popover.getByTestId('class-lecture-status'))
            .toHaveAttribute('data-state', outcome.fails ? 'failed' : 'focused')
          // The board summary arrives too: "Also open in" (other boards show lectures) or the quiet hint.
          await expect(calendar.popover.getByRole('group', { name: 'Also open in' }).or(calendar.popover.getByTestId('class-lecture-hint'))).toBeVisible()
          // Let any re-placement the arrival caused be painted before looking.
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          expect(await row.boundingBox()).toEqual(before)
        })
      }
    }
  })
}

/**
 * A phone turned on its side while a block's popover is open: the calendar
 * is laid out afresh and its blocks move, so the popover is placed again
 * from where its block is now, and never covers it.
 */
test.describe('Popover on a phone turned on its side', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test.beforeEach(async ({ request }) => {
    await reseed()
    await boardWithCalendar(request)
  })
  test.afterAll(async () => { await reseed() })

  async function openTurnMe(page: Page, request: APIRequestContext, hour: number) {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour)
    await trpcMutation(request, 'planItems.create', {
      kind: 'task', title: 'Turn me', course: 'biology', duration_min: 60,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString(),
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    const block = calendar.block('Turn me')
    await block.scrollIntoViewIfNeeded()
    const box = await settledBox(page, block)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(10, box.height / 2))
    await expect(calendar.popover).toBeVisible()
    return { calendar, block }
  }

  async function expectBeside(page: Page, block: Locator, popover: Locator) {
    const after = await settledBox(page, block)
    const box = await settledBox(page, popover)
    const overlap = Math.min(after.x + after.width, box.x + box.width) > Math.max(after.x, box.x)
      && Math.min(after.y + after.height, box.y + box.height) > Math.max(after.y, box.y)
    expect(overlap, `block ${JSON.stringify(after)}, popover ${JSON.stringify(box)}`).toBe(false)
  }

  /** Holds the calendar's week from here until `release`, as a slow phone connection would. */
  async function holdTheWeek(page: Page) {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    await page.route(/planItems\.list/, async (route) => {
      await held
      await route.continue()
    })
    return release
  }

  for (const hour of [9, 13, 18]) {
    test(`${hour}:00 block: its popover never covers it once the phone turns`, async ({ page, request }) => {
      const { calendar, block } = await openTurnMe(page, request, hour)
      await page.setViewportSize({ width: 844, height: 390 })
      await expectBeside(page, block, calendar.popover)
    })
  }

  test('the week loading slowly after the turn: the popover stays open and lands beside its block', async ({ page, request }) => {
    const { calendar, block } = await openTurnMe(page, request, 13)
    const release = await holdTheWeek(page)
    await page.setViewportSize({ width: 844, height: 390 })
    await page.waitForTimeout(1500) // A slow phone connection: the wait is the point.
    release()
    // Not closed while its block was missing: it is back once the week is, beside its block.
    await expect(calendar.popover).toBeVisible()
    await expectBeside(page, block, calendar.popover)
  })

  test('a popover opened just after the turn is left where it opened', async ({ page, request }) => {
    const { calendar } = await openTurnMe(page, request, 13)
    const release = await holdTheWeek(page)
    await page.setViewportSize({ width: 844, height: 390 })
    // Straight away (as soon as Add has stopped moving, quicker than a tap can
    // be driven), while the week loads: Add, a new block's popover in place
    // of the block's.
    await page.evaluate(() => new Promise<void>((resolve) => {
      const add = document.querySelector<HTMLButtonElement>('[data-testid="calendar"] button[aria-label="Add to calendar"]')!
      let last = ''
      let still = 0
      const frame = () => {
        const box = JSON.stringify(add.getBoundingClientRect())
        still = box === last ? still + 1 : 0
        last = box
        if (still < 2) return requestAnimationFrame(frame)
        add.click()
        resolve()
      }
      requestAnimationFrame(frame)
    }))
    await expect(calendar.popover.getByLabel('Start time')).toBeVisible()
    const opened = await settledBox(page, calendar.popover)
    release()
    await page.waitForTimeout(1000) // Long enough for any late re-placing to show.
    await expect(calendar.popover.getByLabel('Start time')).toBeVisible()
    expect(await settledBox(page, calendar.popover)).toEqual(opened)
    // And where it opened is where Add opens it with nothing turning.
    await page.keyboard.press('Escape')
    await expect(calendar.popover).toHaveCount(0)
    await calendar.root.getByRole('button', { name: 'Add to calendar' }).tap()
    await expect(calendar.popover.getByLabel('Start time')).toBeVisible()
    expect(await settledBox(page, calendar.popover)).toEqual(opened)
  })
})
