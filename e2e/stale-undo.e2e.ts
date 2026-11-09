import { test, expect } from './test'
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'
import { startOfLocalDay, wallClock, zonedTimeToUtc } from '../packages/scheduler/src'
import type { PlanItem } from '../packages/substrate/src'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'
import { SEED_MISSED_IDS, SEED_TIME_ZONE, weekMonday } from './seed-week'

/**
 * Flow audit decision 31: Undo of an accepted draft never overwrites what
 * the student changed after the Accept. Its toast goes once an accepted
 * block is edited here; an Undo pressed anyway (the change was made in
 * another tab, which this tab hasn't seen) puts back only what is still as
 * the Accept left it and says calmly what it kept. Mock AI, real server.
 */

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: SEED_TIME_ZONE })

const tasks = (request: APIRequestContext) => trpcQuery<PlanItem[]>(request, 'planItems.list', { kinds: ['task'] })
const toast = (page: Page) => page.getByTestId('toast-host').getByTestId('toast')

/** Monday 00:00 London of the week containing `instant`. */
function weekStart(instant: number): number {
  const m = weekMonday(instant)
  return zonedTimeToUtc(m.year, m.month, m.day, 0, SEED_TIME_ZONE)
}

/** Day column (0 = Monday) and hours of an instant in London. */
function gridPos(instant: number): { dayIndex: number; hours: number } {
  const w = wallClock(instant, SEED_TIME_ZONE)
  const dayIndex = Math.floor((startOfLocalDay(instant, SEED_TIME_ZONE) - weekStart(instant)) / (24 * 3_600_000) + 0.5)
  return { dayIndex, hours: w.hour + w.minute / 60 }
}

/** Drags `item`'s block (by its middle) to `hours` on the same day, or on `dayIndex`. */
async function dragBlock(calendar: CalendarPom, item: PlanItem, to: { dayIndex?: number; hours: number }) {
  const start = gridPos(Date.parse(item.starts_at!))
  const mid = (Date.parse(item.ends_at!) - Date.parse(item.starts_at!)) / 3_600_000 / 2
  await calendar.drag({ dayIndex: start.dayIndex, hours: start.hours + mid }, { dayIndex: to.dayIndex ?? start.dayIndex, hours: to.hours + mid })
}

/** The same board in a second tab of the same browser, as a student with two tabs open. */
async function secondTab(context: BrowserContext, board: string, now?: number) {
  const tab = await context.newPage()
  if (now !== undefined) await tab.clock.setFixedTime(now)
  await tab.goto('/')
  await new TopBarPom(tab).switchToWorkspace(board)
  const calendar = new CalendarPom(tab)
  await expect(calendar.grid).toBeVisible()
  return { tab, calendar }
}

async function calendarBoard(request: APIRequestContext, name: string) {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name })
  await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 1100, height: 760 })
}

test.describe('A stale Undo of an Auto-fill draft', () => {
  /** Priya's seeded week on the demo day (as journey-demo), so the draft lands the same every run. */
  const NOW = Date.parse('2026-10-27T10:30:00Z')

  test.beforeEach(async () => { await reseed({ now: NOW }) })
  test.afterAll(async () => { await reseed() })

  /**
   * Opens the board and accepts an Auto-fill draft. Returns the to-dos
   * whose own block the draft placed (not split into sessions), soonest
   * first, and every task as it was before.
   */
  async function acceptAutofill(page: Page, request: APIRequestContext) {
    await page.clock.setFixedTime(NOW)
    await calendarBoard(request, 'My week')
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    await expect(calendar.block('Biology lecture')).toHaveCount(2, { timeout: 10000 })
    const before = await tasks(request)
    const blocksBefore = await calendar.root.getByTestId('calendar-block').count()

    await calendar.root.getByTestId('help-me-plan').click()
    const plan = calendar.root.getByTestId('help-me-plan-panel')
    await plan.getByTestId('autofill').click()
    await expect(calendar.root.getByTestId('calendar-ghost').first()).toBeVisible({ timeout: 15000 })
    await plan.getByRole('button', { name: 'Accept draft' }).click()
    await expect(toast(page).filter({ hasText: /^Added (\d+ blocks|".+") to your plan/ })).toBeVisible()
    await plan.getByRole('button', { name: /close/i }).first().click()
    // The tray (and the re-fit banner's "one draft at a time" line) go once
    // the last drafted block lands, moving the grid up: drag only after that.
    await expect(calendar.root.getByTestId('proposal-tray')).toHaveCount(0)
    await expect(calendar.root.getByText('Accept or keep the suggested blocks first - one draft at a time.')).toHaveCount(0)

    const placed = async () => (await tasks(request))
      .filter((t) => t.starts_at && before.some((b) => b.id === t.id && !b.starts_at))
      .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))
    await expect.poll(async () => (await placed()).length).toBeGreaterThan(1)
    return { calendar, before, blocksBefore, placed: await placed() }
  }

  test('dragging an accepted block takes the Undo toast away, and the block stays where it was dragged', async ({ page, request }) => {
    const { calendar, placed } = await acceptAutofill(page, request)
    const moved = placed[0]
    await expect(toast(page).filter({ hasText: /^Added / })).toBeVisible()

    // Saturday 15:00 is always free in the seeded week.
    await dragBlock(calendar, moved, { dayIndex: 5, hours: 15 })
    await expect(calendar.block(moved.title)).toHaveAttribute('aria-label', / 15:00 - /)
    // Undo no longer applies to all of the draft: its toast goes.
    await expect(toast(page).filter({ hasText: /^Added / })).toHaveCount(0)

    await page.reload()
    await expect(calendar.block(moved.title)).toHaveAttribute('aria-label', / 15:00 - /, { timeout: 10000 })
    const after = await tasks(request)
    for (const item of placed) expect(after.find((t) => t.id === item.id)!.starts_at, item.title).toBeTruthy()
  })

  test('Undo after a block was dragged in another tab leaves that block as the student left it, puts the rest back and says so', async ({ page, context, request }) => {
    const { calendar, before, blocksBefore, placed } = await acceptAutofill(page, request)
    const moved = placed[0]
    const undoToast = toast(page).filter({ hasText: /^Added / })
    // Held under the pointer, so it waits while the other tab is used.
    await undoToast.hover()

    const other = await secondTab(context, 'My week', NOW)
    await dragBlock(other.calendar, moved, { dayIndex: 5, hours: 15 })
    await expect(other.calendar.block(moved.title)).toHaveAttribute('aria-label', / 15:00 - /)
    await expect.poll(async () => (await tasks(request)).find((t) => t.id === moved.id)!.starts_at).not.toBe(moved.starts_at)
    const dragged = (await tasks(request)).find((t) => t.id === moved.id)!
    await other.tab.close()

    // This tab hasn't seen the drag: its toast is still up.
    await undoToast.getByRole('button', { name: 'Undo' }).click()
    await expect(toast(page)).toHaveText(`Put the rest back. "${moved.title}" changed since, so it stays as it is.`)

    const check = async () => {
      const after = await tasks(request)
      // The dragged block is where the student put it.
      expect(after.find((t) => t.id === moved.id)).toMatchObject({ starts_at: dragged.starts_at, ends_at: dragged.ends_at, duration_min: dragged.duration_min })
      // Everything else the draft wrote is back as it was: no new sessions, no other times.
      const was = (t: PlanItem) => [t.id, t.starts_at, t.ends_at, t.duration_min]
      expect(after.filter((t) => t.id !== moved.id).map(was).sort()).toEqual(before.filter((t) => t.id !== moved.id).map(was).sort())
    }
    await expect.poll(async () => { try { await check(); return true } catch { return false } }).toBe(true)

    await page.reload()
    await expect(calendar.block(moved.title)).toHaveAttribute('aria-label', / 15:00 - /, { timeout: 10000 })
    await expect(calendar.root.getByTestId('calendar-block')).toHaveCount(blocksBefore + 1)
    await check()
  })
})

test.describe('A stale Undo of a re-fit', () => {
  test.beforeEach(async ({ request }) => {
    await reseed()
    // The test makes its own missed blocks: set aside the seeded ones.
    for (const id of SEED_MISSED_IDS) await trpcMutation(request, 'planItems.delete', id)
  })
  test.afterAll(async () => { await reseed() })

  /** `days` from today at `hour`:00 local time. */
  function daysFromNow(days: number, hour: number): string {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d.toISOString()
  }

  test('Move them, then a moved block is dragged in another tab: Undo leaves it there and puts the other back', async ({ page, context, request }) => {
    const readChapter = await trpcMutation<PlanItem>(request, 'planItems.create', {
      kind: 'task', title: 'Read chapter 5', duration_min: 60, starts_at: daysFromNow(-2, 10), ends_at: daysFromNow(-2, 11),
    })
    const labWriteUp = await trpcMutation<PlanItem>(request, 'planItems.create', {
      kind: 'task', title: 'Lab write-up', duration_min: 60, starts_at: daysFromNow(-1, 19), ends_at: daysFromNow(-1, 20), course: 'chemistry',
    })
    // Busy all today, so the new times land tomorrow.
    await trpcMutation(request, 'planItems.create', { kind: 'commitment', title: 'Away today', starts_at: daysFromNow(0, 0), ends_at: daysFromNow(1, 0) })
    await calendarBoard(request, 'My week')
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    const banner = calendar.root.getByTestId('refit-banner')

    await expect(banner).toContainText("2 blocks didn't happen. Re-fit them?", { timeout: 10000 })
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(2)
    await banner.getByRole('button', { name: 'Move them' }).click()
    const undoToast = toast(page).filter({ hasText: 'Moved 2 blocks' })
    await expect(undoToast).toBeVisible()
    await undoToast.hover()
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: SEED_TIME_ZONE })).toEqual([])
    const moved = (await tasks(request)).find((t) => t.id === readChapter.id)!

    // Another tab: the student drags Read chapter 5 on to 21:00 the same day.
    const other = await secondTab(context, 'My week')
    if (weekStart(Date.parse(moved.starts_at!)) !== weekStart(Date.now())) await other.calendar.nextWeek()
    await expect(other.calendar.block('Read chapter 5')).toBeVisible()
    await dragBlock(other.calendar, moved, { hours: 21 })
    await expect(other.calendar.block('Read chapter 5')).toHaveAttribute('aria-label', / 21:00 - /)
    await expect.poll(async () => (await tasks(request)).find((t) => t.id === readChapter.id)!.starts_at).not.toBe(moved.starts_at)
    const dragged = (await tasks(request)).find((t) => t.id === readChapter.id)!
    await other.tab.close()

    await undoToast.getByRole('button', { name: 'Undo' }).click()
    await expect(toast(page)).toHaveText('Put the rest back. "Read chapter 5" changed since, so it stays as it is.')
    await expect.poll(async () => (await tasks(request)).find((t) => t.id === labWriteUp.id)!.starts_at).toBe(labWriteUp.starts_at)
    expect((await tasks(request)).find((t) => t.id === readChapter.id)).toMatchObject({ starts_at: dragged.starts_at, ends_at: dragged.ends_at })

    await page.reload()
    if (weekStart(Date.parse(dragged.starts_at!)) !== weekStart(Date.now())) await calendar.nextWeek()
    await expect(calendar.block('Read chapter 5')).toHaveAttribute('aria-label', / 21:00 - /, { timeout: 10000 })
    const after = await tasks(request)
    expect(after.find((t) => t.id === readChapter.id)).toMatchObject({ starts_at: dragged.starts_at, ends_at: dragged.ends_at })
    expect(after.find((t) => t.id === labWriteUp.id)).toMatchObject({ starts_at: labWriteUp.starts_at, ends_at: labWriteUp.ends_at })
  })
})
