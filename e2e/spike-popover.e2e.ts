/**
 * THROWAWAY SPIKE (K0 spike 1). Never merged.
 *
 * Runs the same presses in each popover mode (see
 * packages/lens-calendar/src/spike-popover.tsx), picked per page through
 * localStorage, and records what happened instead of failing fast, so one run
 * gives the whole comparison. SPIKE_OUT names the folder for results/screenshots.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation } from './api'

const OUT = process.env.SPIKE_OUT ?? 'test-results/spike'
const MODES = (process.env.SPIKE_MODES ?? 'native,sdk,sdk-marks,sdk-capture').split(',')
const results: Record<string, unknown> = {}
const record = (name: string, value: unknown) => {
  results[name] = value
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/results-${test.info().project.name}-${process.env.SPIKE_TAG ?? 'run'}.json`, JSON.stringify(results, null, 2))
}

async function board(request: APIRequestContext, name: string, phone: boolean) {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: phone ? 900 : 900, height: 640,
  })
}

const today = new Date()
const at = (h: number, m = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m)
async function block(request: APIRequestContext, title: string, start: Date, min = 60) {
  return trpcMutation<{ id: string }>(request, 'planItems.create', {
    kind: 'task', title, course: 'biology', duration_min: min,
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + min * 60_000).toISOString(),
  })
}

async function open(page: Page, mode: string, name: string) {
  await page.addInitScript((m) => {
    localStorage.setItem('spike-popover', m)
    ;(window as unknown as { __spikeLog: string[] }).__spikeLog = []
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'click']) {
      window.addEventListener(type, (e) => {
        const log = (window as unknown as { __spikeLog: string[] }).__spikeLog
        const t = e.target as Element
        log.push(`${type}${e.defaultPrevented ? '(prevented)' : ''}@${t.closest?.('[data-calendar-popover]') ? 'popover' : t.closest?.('[data-testid=calendar-block]') ? 'block' : t.tagName}`)
      }, { capture: false })
    }
  }, mode)
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace(name)
  expect(await page.evaluate(() => (window as unknown as { __spikePopover: string }).__spikePopover)).toBe(mode)
  return new CalendarPom(page)
}

const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
async function popoverState(page: Page, calendar: CalendarPom) {
  await page.waitForTimeout(400)
  const count = await calendar.popover.count()
  const label = count ? await calendar.popover.first().evaluate((el) => el.closest('[aria-label]')?.getAttribute('aria-label') ?? '') : null
  const log = await page.evaluate(() => (window as unknown as { __spikeLog: string[] }).__spikeLog.splice(0))
  return { count, label, log }
}

test.describe('Phone: presses with a popover open', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true })
  for (const mode of MODES) {
    test(`phone taps and touch drag (${mode})`, async ({ page, request }) => {
      await reseed()
      await board(request, 'Spike', true)
      await block(request, 'Alpha', at(2))
      await block(request, 'Bravo', at(6))
      const calendar = await open(page, mode, 'Spike')
      const scroll = calendar.root.getByTestId('calendar-scroll')
      /**
       * Scrolls the grid so client y `y()` sits clear of the open popover (the
       * popover doesn't scroll with the grid), and says whether it managed to.
       */
      const clear = async (y: () => Promise<number>) => {
        for (let i = 0; i < 2; i++) {
          const pop = await calendar.popover.boundingBox()
          const sc = (await scroll.boundingBox())!
          const now = await y()
          if (!pop || now < pop.y - 20 || now > pop.y + pop.height + 20) return true
          const roomAbove = pop.y - sc.y
          const want = roomAbove > 80 ? sc.y + roomAbove / 2 : pop.y + pop.height + 60
          await scroll.evaluate((el, d) => { el.scrollTop += d }, now - want)
          await settle(page)
        }
        const pop = (await calendar.popover.boundingBox())!
        const now = await y()
        return now < pop.y - 20 || now > pop.y + pop.height + 20
      }
      const blockY = (title: string) => async () => { const b = (await calendar.block(title).boundingBox())!; return b.y + Math.min(10, b.height / 2) }
      const blockX = async (title: string) => { const b = (await calendar.block(title).boundingBox())!; return b.x + b.width / 2 }
      const openAlpha = async () => {
        if (await calendar.popover.count()) await page.keyboard.press('Escape')
        await expect(calendar.popover).toHaveCount(0)
        await scroll.evaluate((el) => { el.scrollTop = 0 })
        await calendar.block('Alpha').scrollIntoViewIfNeeded()
        await page.touchscreen.tap(await blockX('Alpha'), await blockY('Alpha')())
        await expect(calendar.popover).toBeVisible()
        await popoverState(page, calendar)
      }
      const out: Record<string, unknown> = {}

      // P1: Alpha open, tap Bravo: today Alpha closes and Bravo opens in that one tap.
      await openAlpha()
      let reachable = await clear(blockY('Bravo'))
      await page.touchscreen.tap(await blockX('Bravo'), await blockY('Bravo')())
      out.tapOtherBlock = { reachable, ...(await popoverState(page, calendar)) }
      await page.screenshot({ path: `${OUT}/phone-${test.info().project.name}-${mode}-tap-other.png` })

      // P2: a tap on the open popover's own block: today only closes it (toggle).
      await openAlpha()
      reachable = await clear(blockY('Alpha'))
      await page.touchscreen.tap(await blockX('Alpha'), await blockY('Alpha')())
      out.tapOwnBlock = { reachable, ...(await popoverState(page, calendar)) }

      // P3: a tap on empty time (04:30, between the two): today only closes it, no new block.
      await openAlpha()
      const emptyY = async () => (await calendar.point(0, 4.5)).y
      reachable = await clear(emptyY)
      await page.touchscreen.tap((await calendar.point(0, 4.5)).x, await emptyY())
      out.tapEmptyTime = { reachable, ...(await popoverState(page, calendar)) }

      // P4: Alpha open, touch-drag Bravo down an hour: today Alpha closes and Bravo moves.
      await openAlpha()
      reachable = await clear(blockY('Bravo'))
      const bravo = calendar.block('Bravo')
      const before = await bravo.getAttribute('aria-label')
      const from = { x: await blockX('Bravo'), y: await blockY('Bravo')() }
      const hour = (await calendar.point(0, 7)).y - (await calendar.point(0, 6)).y
      if (page.context().browser()?.browserType().name() === 'chromium') {
        const cdp = await page.context().newCDPSession(page)
        const touch = (type: string, y: number) => cdp.send('Input.dispatchTouchEvent', {
          type, touchPoints: type === 'touchEnd' ? [] : [{ x: from.x, y }],
        })
        await touch('touchStart', from.y)
        for (let i = 1; i <= 8; i++) await touch('touchMove', from.y + (hour * i) / 8)
        await touch('touchEnd', from.y + hour)
        await settle(page)
        out.touchDragOtherBlock = { reachable, ...(await popoverState(page, calendar)), bravoBefore: before, bravoAfter: await bravo.getAttribute('aria-label') }
      }
      await page.screenshot({ path: `${OUT}/phone-${test.info().project.name}-${mode}-after-drag.png` })
      record(`phone/${mode}`, out)
    })
  }
})

test.describe('Desktop: presses with a popover open', () => {
  for (const mode of MODES) {
    test(`desktop press on empty time (${mode})`, async ({ page, request }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await reseed()
      await board(request, 'Spike', false)
      await block(request, 'Alpha', at(10))
      const calendar = await open(page, mode, 'Spike')
      await calendar.block('Alpha').click()
      await expect(calendar.popover).toBeVisible()
      await popoverState(page, calendar)
      const out: Record<string, unknown> = {}
      // Outside the calendar (empty board canvas right of the panel): today it stays open.
      await page.mouse.click(1250, 600)
      out.pressOutsideCalendar = await popoverState(page, calendar)
      if (!(await calendar.popover.count())) {
        await calendar.block('Alpha').click()
        await expect(calendar.popover).toBeVisible()
        await popoverState(page, calendar)
      }
      // Empty time: today it only closes, no new block.
      const p = await calendar.point(0, 8.5)
      await page.mouse.click(p.x, p.y)
      out.pressEmptyTime = await popoverState(page, calendar)
      record(`desktop/${mode}`, out)
    })
  }
})

test.describe('Placement', () => {
  for (const mode of MODES) {
    test(`desktop: beside the press (${mode})`, async ({ page, request }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await reseed()
      await board(request, 'Spike', false)
      await block(request, 'Alpha', at(10))
      const calendar = await open(page, mode, 'Spike')
      const b = calendar.block('Alpha')
      const box = (await b.boundingBox())!
      const press = { x: box.x + box.width * 0.3, y: box.y + box.height / 2 }
      await page.mouse.click(press.x, press.y)
      await expect(calendar.popover).toBeVisible()
      await settle(page)
      const pop = (await calendar.popover.boundingBox())!
      await page.screenshot({ path: `${OUT}/desktop-${mode}-placement.png` })
      record(`desktop-placement/${mode}`, { press, popover: pop, dxLeft: Math.round(pop.x - press.x), dyTop: Math.round(pop.y - press.y) })
    })

    test(`phone: above or below the block (${mode})`, async ({ page, request }) => {
      await page.setViewportSize({ width: 400, height: 860 })
      await reseed()
      await board(request, 'Spike', true)
      await block(request, 'Alpha', at(10))
      await block(request, 'Late', at(20))
      const calendar = await open(page, mode, 'Spike')
      const out: Record<string, unknown> = {}
      for (const title of ['Alpha', 'Late']) {
        const b = calendar.block(title)
        await b.scrollIntoViewIfNeeded()
        const box = (await b.boundingBox())!
        await page.mouse.click(box.x + box.width / 2, box.y + Math.min(10, box.height / 2))
        await expect(calendar.popover).toBeVisible()
        await settle(page)
        const pop = (await calendar.popover.boundingBox())!
        const overlaps = pop.y < box.y + box.height && pop.y + pop.height > box.y
        out[title] = { block: box, popover: pop, side: pop.y + pop.height <= box.y ? 'above' : pop.y >= box.y + box.height ? 'below' : 'covers', overlaps }
        await page.screenshot({ path: `${OUT}/phone-${mode}-placement-${title}.png` })
        await page.keyboard.press('Escape')
        await expect(calendar.popover).toHaveCount(0)
      }
      record(`phone-placement/${mode}`, out)
    })
  }
})

test.describe('Layers', () => {
  for (const mode of MODES) {
    test(`a dialog opened from the popover sits above it (${mode})`, async ({ page, request }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await reseed()
      await board(request, 'Spike', false)
      await block(request, 'Alpha', at(10))
      const calendar = await open(page, mode, 'Spike')
      await calendar.block('Alpha').click()
      await expect(calendar.popover).toBeVisible()
      // Open a shared-ui Dialog (fixed, z-50) while the popover stays open: the board menu's Rename board.
      await page.evaluate(() => {
        const d = document.createElement('div')
        d.id = 'fake-dialog'
        d.className = 'fixed inset-0 z-50'
        d.style.background = 'rgba(200,0,0,0.5)'
        document.body.appendChild(d)
      })
      const pop = (await calendar.popover.boundingBox())!
      const top = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        return el?.closest('#fake-dialog') ? 'dialog' : el?.closest('[data-calendar-popover]') ? 'popover' : el?.tagName
      }, { x: pop.x + pop.width / 2, y: pop.y + pop.height / 2 })
      await page.screenshot({ path: `${OUT}/layers-${mode}.png` })
      record(`layers/${mode}`, { onTopAtPopoverCentre: top })
    })
  }
})
