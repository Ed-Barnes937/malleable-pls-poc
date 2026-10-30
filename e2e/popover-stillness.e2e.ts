import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
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

/** Where an element is once it has stopped moving (the grid is still scrolling it into view just after). */
async function settledBox(page: Page, el: Locator) {
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

async function boardWithCalendar(request: APIRequestContext) {
  const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'My week' })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: board.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 900, height: 640,
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

for (const viewport of VIEWPORTS) {
  test.describe(`Class popover stillness on ${viewport.name}`, () => {
    test.use({ viewport: viewport.size, hasTouch: viewport.touch, isMobile: viewport.touch })
    test.beforeEach(async ({ request }) => {
      await reseed()
      await boardWithCalendar(request)
    })

    for (const outcome of CLASS_OUTCOMES) {
      for (const hour of HOURS) {
        test(`${hour}:00 class: its buttons stay where they are while ${outcome.name}`, async ({ page, request }) => {
          const start = startOfLocalDay(Date.now(), SEED_TIME_ZONE) + hour * 3_600_000
          await trpcMutation(request, 'planItems.create', {
            kind: 'commitment', title: 'Tap then wait', subtype: 'class', course: 'biology',
            starts_at: new Date(start).toISOString(), ends_at: new Date(start + 3_600_000).toISOString(),
            timeZone: SEED_TIME_ZONE,
          })
          await page.goto('/')
          await new TopBarPom(page).switchToWorkspace('My week')
          const calendar = new CalendarPom(page)
          const block = calendar.block('Tap then wait')
          await block.scrollIntoViewIfNeeded()

          // The focus and the board summary are held from here (tRPC batches
          // requests, so holding earlier would hold the calendar's own).
          let release!: () => void
          const held = new Promise<void>((resolve) => { release = resolve })
          await page.route(/lectures\.forClassOccurrence|workspaces\.summary/, async (route) => {
            await held
            if (outcome.fails && route.request().url().includes('forClassOccurrence')) return route.abort()
            await route.continue()
          })
          const box = await settledBox(page, block)
          const at = { x: box.x + box.width / 2, y: box.y + Math.min(10, box.height / 2) }
          if (viewport.touch) await page.touchscreen.tap(at.x, at.y)
          else await page.mouse.click(at.x, at.y)

          const row = calendar.popover.locator('[data-popover-anchor]')
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
