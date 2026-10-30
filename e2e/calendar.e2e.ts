import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PlanItemOccurrence } from '../packages/substrate/src'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { trpcQuery } from './api'
import { reseed } from './reseed'
import { apiUrl } from './ports'

/**
 * Calendar widget journeys (plan tickets T5, U4): a weekly class repeats,
 * study time drags, and a study block from a lecture moment leads with where
 * it came from, goes to that moment in the Transcript (on this board or on
 * another one, with a way back) and names the automation that made it.
 */

const headers = { 'x-user-id': 'dev-user-1' }

async function call<T = { id: string }>(request: APIRequestContext, proc: string, input: unknown): Promise<T> {
  const res = await request.post(`${apiUrl}/${proc}`, { headers, data: { json: input } })
  expect(res.ok(), `${proc}: ${await res.text()}`).toBe(true)
  return (await res.json()).result.data.json as T
}

async function board(request: APIRequestContext, name: string, lensTypes: string[]) {
  const ws = await call(request, 'workspaces.create', { name })
  let x = 24
  for (const lensType of lensTypes) {
    const width = lensType === 'calendar' ? 900 : 440
    await call(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType, slotName: lensType, pos_x: x, pos_y: 24, width, height: 640 })
    x += width + 24
  }
  return ws.id
}

const monday = (() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
})()
const at = (day: number, h: number, m = 0) =>
  new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h, m).toISOString()
/** "19:30": a time as the app shows it (24-hour, local). */
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

test.describe('Calendar', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('create a weekly class and see it repeat next week', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    await expect(calendar.grid).toBeVisible()

    await calendar.clickAt(1, 11.1)
    await calendar.popover.getByLabel('Title').fill('Genetics seminar')
    await calendar.popover.getByLabel('Course', { exact: true }).selectOption('biology')
    await calendar.popover.getByRole('checkbox', { name: 'Repeats weekly' }).check()
    await calendar.popover.getByRole('button', { name: 'Add' }).click()
    await expect(calendar.block('Genetics seminar')).toHaveAttribute('aria-label', /11:00 - 12:00/)

    await calendar.nextWeek()
    await expect(calendar.block('Genetics seminar')).toHaveAttribute('aria-label', /11:00 - 12:00/)

    // Persists: the server expands the series for the week after too.
    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await calendar.nextWeek()
    await calendar.nextWeek()
    await expect(calendar.block('Genetics seminar')).toBeVisible()
  })

  test('one Escape closes the popover, even with the panel selected', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)

    await calendar.clickAt(2, 14.1)
    await expect(calendar.popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(calendar.popover).toHaveCount(0)
    // The next click on the grid starts a new item straight away.
    await calendar.clickAt(3, 15.1)
    await expect(calendar.popover.getByLabel('Start time')).toHaveValue('15:00')
  })

  test('keyboard: Tab reaches a block, Enter opens it, Escape returns focus', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    // Saturday, clear of the seeded week's blocks (which come first in tab order).
    await call(request, 'planItems.create', { kind: 'commitment', title: 'Extra shift', starts_at: at(5, 18), ends_at: at(5, 22) })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    const shift = calendar.block('Extra shift')
    await expect(shift).toBeVisible()

    await calendar.root.getByRole('button', { name: 'Add to calendar' }).focus()
    for (let i = 0; i < 30 && !(await shift.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(shift).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(calendar.popover.getByLabel('Title')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(calendar.popover).toHaveCount(0)
    await expect(shift).toBeFocused()
  })

  test('on a slow network the pressed button says it is saving until the save lands', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    // Saturday, clear of the seeded week's blocks.
    await call(request, 'planItems.create', { kind: 'task', title: 'Read chapter 3', starts_at: at(5, 10), ends_at: at(5, 11), duration_min: 60 })
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    await page.route(/planItems\.complete/, async (route) => {
      await held
      await route.continue()
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    await calendar.block('Read chapter 3').click()

    // From the keyboard: focus stays on the pressed button while it waits.
    await calendar.popover.getByRole('button', { name: 'Mark done' }).focus()
    await page.keyboard.press('Enter')
    const pressed = calendar.popover.getByRole('button', { name: 'Marking done...' })
    await expect(pressed).toHaveAttribute('aria-busy', 'true')
    await expect(pressed).toHaveAttribute('aria-disabled', 'true')
    await expect(pressed).toBeFocused()
    // Pending is not disabled to the eye: the label stays fully legible.
    await expect(pressed).toHaveCSS('opacity', '1')
    // Pressing it again does nothing; the other buttons wait.
    await page.keyboard.press('Enter')
    await expect(calendar.popover.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(calendar.popover.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'false')
    // Screen readers hear it too.
    await expect(calendar.popover.getByRole('status')).toHaveText('Marking done...')

    release()
    await expect(calendar.popover).toHaveCount(0)
    await calendar.block('Read chapter 3').click()
    await expect(calendar.popover.getByRole('button', { name: 'Not done yet' })).toBeEnabled()
    await expect(calendar.popover.getByRole('status')).toHaveText('')
  })

  test('a save that fails after its popover was closed says so above the calendar', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    await call(request, 'planItems.create', { kind: 'task', title: 'Read chapter 3', starts_at: at(5, 10), ends_at: at(5, 11), duration_min: 60 })
    let fail!: () => void
    const held = new Promise<void>((resolve) => { fail = resolve })
    await page.route(/planItems\.complete/, async (route) => {
      await held
      await route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' })
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    await calendar.block('Read chapter 3').click()
    await calendar.popover.getByRole('button', { name: 'Mark done' }).click()
    await expect(calendar.popover.getByRole('button', { name: 'Marking done...' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(calendar.popover).toHaveCount(0)

    fail()
    const alert = calendar.root.getByRole('alert').filter({ hasText: 'Read chapter 3' })
    await expect(alert).toHaveText('Couldn\'t mark "Read chapter 3" done. Try again.')
    await expect.poll(async () => {
      const items = await trpcQuery<{ title: string; status: string }[]>(request, 'planItems.list', { kinds: ['task'] })
      return items.find((item) => item.title === 'Read chapter 3')?.status
    }).toBe('open')
    await alert.getByRole('button', { name: 'Dismiss' }).click()
    await expect(alert).toHaveCount(0)
  })

  test('drag study time to a new slot', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    const task = await call(request, 'planItems.create', {
      kind: 'task', title: 'Revise respiration', starts_at: at(2, 16), ends_at: at(2, 17), duration_min: 60, course: 'biology',
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    await expect(calendar.block('Revise respiration')).toBeVisible()

    // The block moves at once (optimistically); reload only once the save is back.
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('planItems.update'))
    await calendar.drag({ dayIndex: 2, hours: 16.25 }, { dayIndex: 4, hours: 10.25 })
    await expect(calendar.block('Revise respiration')).toHaveAttribute('aria-label', /10:00 - 11:00/)
    expect((await saved).ok()).toBe(true)

    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await expect(calendar.block('Revise respiration')).toHaveAttribute('aria-label', /10:00 - 11:00/)
    const res = await request.get(`${apiUrl}/planItems.byId?input=${encodeURIComponent(JSON.stringify({ json: task.id }))}`, { headers })
    const stored = (await res.json()).result.data.json
    expect(stored).toMatchObject({ starts_at: at(4, 10), ends_at: at(4, 11), duration_min: 60 })
  })

  test('drag a 20-minute review by its thin bar, within its day and to another day', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    const review = await call(request, 'planItems.create', {
      kind: 'task', title: 'Review: maternal inheritance', starts_at: at(2, 13), ends_at: at(2, 13, 20), duration_min: 20,
      course: 'biology', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 2_200_000,
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    const block = calendar.block('Review: maternal inheritance')
    await expect(block).toHaveAttribute('aria-label', /13:00 - 13:20/)
    // Drawn to scale: a thin bar, its title in a caption beside it.
    await expect(block.getByTestId('calendar-block-caption')).toBeVisible()

    // Press in the middle of the bar, as a student aiming at it would, and drop
    // it 10 minutes into the slot wanted (the bar's middle is about 10 minutes in).
    const grabBar = async (to: { dayIndex: number; hours: number }) => {
      await calendar.point(to.dayIndex, to.hours) // waits for the grid to settle
      const bar = (await block.boundingBox())!
      const target = await calendar.point(to.dayIndex, to.hours)
      const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('planItems.update'))
      await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
      await page.mouse.down()
      await page.mouse.move(target.x, target.y, { steps: 8 })
      await page.mouse.up()
      expect((await saved).ok()).toBe(true)
    }
    const stored = async () => {
      const res = await request.get(`${apiUrl}/planItems.byId?input=${encodeURIComponent(JSON.stringify({ json: review.id }))}`, { headers })
      return (await res.json()).result.data.json
    }

    // Later the same day: it moves, still 20 minutes.
    await grabBar({ dayIndex: 2, hours: 15 + 10 / 60 })
    await expect(block).toHaveAttribute('aria-label', /15:00 - 15:20/)
    expect(await stored()).toMatchObject({ starts_at: at(2, 15), ends_at: at(2, 15, 20), duration_min: 20 })

    // To another day.
    await grabBar({ dayIndex: 4, hours: 10 + 10 / 60 })
    await expect(block).toHaveAttribute('aria-label', /10:00 - 10:20/)
    expect(await stored()).toMatchObject({ starts_at: at(4, 10), ends_at: at(4, 10, 20), duration_min: 20 })

    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await expect(block).toHaveAttribute('aria-label', /10:00 - 10:20/)
  })

  test('with a popover open, pressing a block drags it in one go and closes the popover; a plain click on its own block closes it', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    const study = await call(request, 'planItems.create', {
      kind: 'task', title: 'Revise respiration', starts_at: at(2, 16), ends_at: at(2, 17), duration_min: 60, course: 'biology',
    })
    const review = await call(request, 'planItems.create', {
      kind: 'task', title: 'Review: maternal inheritance', starts_at: at(0, 13), ends_at: at(0, 13, 20), duration_min: 20, course: 'biology',
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    const stored = async (id: string) => {
      const res = await request.get(`${apiUrl}/planItems.byId?input=${encodeURIComponent(JSON.stringify({ json: id }))}`, { headers })
      return (await res.json()).result.data.json
    }
    /** Presses the middle of `title`'s block and drops that point at `to`. */
    const dragWithPopoverOpen = async (title: string, to: { dayIndex: number; hours: number }) => {
      await expect(calendar.popover).toBeVisible()
      const target = await calendar.point(to.dayIndex, to.hours) // waits for the grid to settle
      const box = (await calendar.block(title).boundingBox())!
      const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('planItems.update'), { timeout: 5000 })
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(target.x, target.y, { steps: 8 })
      await page.mouse.up()
      await expect(calendar.popover).toHaveCount(0)
      expect((await saved).ok()).toBe(true)
    }

    // Its own popover open: the block itself moves.
    await calendar.block('Revise respiration').click()
    await dragWithPopoverOpen('Revise respiration', { dayIndex: 4, hours: 10.5 })
    await expect(calendar.block('Revise respiration')).toHaveAttribute('aria-label', /10:00 - 11:00/)
    expect(await stored(study.id)).toMatchObject({ starts_at: at(4, 10), ends_at: at(4, 11), duration_min: 60 })

    // Another block's popover open: the pressed block moves (a short review, by the middle of its bar).
    await calendar.block('Revise respiration').click()
    await dragWithPopoverOpen('Review: maternal inheritance', { dayIndex: 1, hours: 12 + 10 / 60 })
    await expect(calendar.block('Review: maternal inheritance')).toHaveAttribute('aria-label', /12:00 - 12:20/)
    expect(await stored(review.id)).toMatchObject({ starts_at: at(1, 12), ends_at: at(1, 12, 20), duration_min: 20 })

    // A plain click on the block whose popover is open closes it (a toggle); the next click opens it again.
    await calendar.block('Revise respiration').click()
    await expect(calendar.popover).toBeVisible()
    await calendar.block('Revise respiration').click()
    await expect(calendar.popover).toHaveCount(0)
    await expect(calendar.block('Revise respiration')).toBeFocused()
    await calendar.block('Revise respiration').click()
    await expect(calendar.popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(calendar.popover).toHaveCount(0)

    // A press on empty time with a popover open only closes it: no new block starts.
    await calendar.block('Revise respiration').click()
    await expect(calendar.popover).toBeVisible()
    await calendar.clickAt(0, 8.5)
    await expect(calendar.popover).toHaveCount(0)

    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await expect(calendar.block('Revise respiration')).toHaveAttribute('aria-label', /10:00 - 11:00/)
    await expect(calendar.block('Review: maternal inheritance')).toHaveAttribute('aria-label', /12:00 - 12:20/)
  })

  test('while its save is in flight, pressing the block only closes the popover: the save is not undone by a move', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    const alpha = await call(request, 'planItems.create', {
      kind: 'task', title: 'Alpha', starts_at: at(4, 10), ends_at: at(4, 11), duration_min: 60, course: 'biology',
    })
    // The popover's save is slow; anything after it is not.
    const updates: string[] = []
    let first = true
    await page.route(/planItems\.update/, async (route) => {
      updates.push(route.request().postData() ?? '')
      if (first) {
        first = false
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      await route.continue()
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    const block = calendar.block('Alpha')

    await block.click()
    await calendar.popover.getByLabel('Start time').fill('12:00')
    await calendar.popover.getByLabel('End time').fill('13:00')
    const saved = page.waitForResponse((r) => r.url().includes('planItems.update'))
    await calendar.popover.getByRole('button', { name: 'Save' }).click()
    await expect(calendar.popover.getByRole('status')).toHaveText('Saving...')

    // Press the block and drag it while "Saving..." shows.
    const target = await calendar.point(3, 14.5)
    const box = (await block.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x, target.y, { steps: 8 })
    await page.mouse.up()
    await expect(calendar.popover).toHaveCount(0)

    expect((await saved).ok()).toBe(true)
    await expect(block).toHaveAttribute('aria-label', /12:00 - 13:00/)
    // Only the save went to the server: the press moved nothing.
    expect(updates).toHaveLength(1)
    const res = await request.get(`${apiUrl}/planItems.byId?input=${encodeURIComponent(JSON.stringify({ json: alpha.id }))}`, { headers })
    expect((await res.json()).result.data.json).toMatchObject({ starts_at: at(4, 12), ends_at: at(4, 13) })

    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await expect(block).toHaveAttribute('aria-label', /12:00 - 13:00/)
  })

  test('a plain click on the due marker whose popover is open closes it, keeping the toggle blocks have', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    await call(request, 'planItems.create', { kind: 'deadline', title: 'Essay due', course: 'biology', due_at: at(5, 17) })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    const marker = calendar.root.getByTestId('calendar-due').filter({ hasText: 'Essay due' })

    await marker.click()
    await expect(calendar.popover).toBeVisible()
    await calendar.popover.getByLabel('Title').fill('Essay due (edited)')
    await marker.click()
    // Give a reopen (the old flicker) a frame or two to show.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(calendar.popover).toHaveCount(0)
    await expect(marker).toBeFocused()

    // The next click, and Enter, open it again.
    await marker.click()
    await expect(calendar.popover.getByLabel('Title')).toHaveValue('Essay due')
    await page.keyboard.press('Escape')
    await expect(calendar.popover).toHaveCount(0)
    await expect(marker).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(calendar.popover).toBeVisible()
  })

  test('a study block from a lecture moment: "Go to moment" lands on the transcript moment', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar', 'transcript'])
    // 2,200,000 ms is in the chloroplast DNA segment near the end of the lecture.
    await call(request, 'planItems.create', {
      kind: 'task', title: 'Review: chloroplast DNA', starts_at: at(2, 20), ends_at: at(2, 20, 30), duration_min: 30,
      course: 'biology', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 2_200_000,
    })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    const transcript = new PanelGridPom(page).panelByLabel('Transcript')
    await expect(transcript.getByText('Pick a lecture to see its transcript')).toBeVisible()

    await calendar.block('Review: chloroplast DNA').click()
    // The popover leads with where the block came from; nothing moves until asked.
    await expect(calendar.popover.getByTestId('calendar-moment-source')).toHaveText('From Biology Lecture: Mitochondrial DNA · 36:40')
    await expect(calendar.popover.getByTestId('calendar-moment-quote')).toContainText('chloroplast DNA')
    await expect(transcript.getByText('Pick a lecture to see its transcript')).toBeVisible()
    await calendar.popover.getByRole('button', { name: 'Go to moment' }).click()

    const moment = transcript.locator('[data-moment]')
    await expect(moment).toContainText('chloroplast DNA', { timeout: 10000 })
    await expect(moment).toBeInViewport()
    await expect(topBar.lecturePill).toHaveText('Biology Lecture: Mitochondrial DNA')
    await expect(calendar.root.getByTestId('calendar-moment')).toContainText('Showing this moment in the Transcript.')
    // The calendar now highlights the block linked to the focused lecture.
    await expect(calendar.block('Review: chloroplast DNA')).toHaveAttribute('data-linked', 'true')
  })

  test('from a board without a Transcript, "Go to moment" opens it on one that has it, with a way back', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    await call(request, 'planItems.create', {
      kind: 'task', title: 'Review: chloroplast DNA', starts_at: at(2, 20), ends_at: at(2, 20, 30), duration_min: 30,
      course: 'biology', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 2_200_000,
    })
    // A controllable clock, to show the toast outlasting the usual 8s.
    await page.clock.install()
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)

    // The toasts' live region is there before anything is said, so the first toast is announced.
    const toast = page.getByTestId('toast-host')
    const announcer = page.getByTestId('toast-announcer')
    await expect(announcer).toBeAttached()
    await expect(announcer).toHaveAttribute('aria-live', 'polite')
    await expect(announcer).toHaveAttribute('role', 'status')

    await calendar.block('Review: chloroplast DNA').click()
    await calendar.popover.getByRole('button', { name: 'Go to moment' }).click()

    // A board with a Transcript set up for reviewing (In Lecture's captures),
    // first in tab order: Evening Review.
    await topBar.expectActiveWorkspace('Evening Review')
    const transcript = new PanelGridPom(page).panelByLabel('Transcript')
    const moment = transcript.locator('[data-moment]')
    await expect(moment).toContainText('chloroplast DNA', { timeout: 10000 })
    await expect(moment).toBeInViewport()
    // Keyboard focus lands on the moment too.
    await expect(moment.getByRole('button').first()).toBeFocused()

    // The toast says where it went and offers the way back; it stays while
    // the student is on this board, so the way back is there whenever they reach it.
    await expect(toast).toContainText('Opened 36:40 in Evening Review')
    await page.clock.runFor(10_000)
    await expect(toast.getByRole('button', { name: 'Back to Week plan' })).toBeVisible()
    await toast.getByRole('button', { name: 'Back to Week plan' }).click()
    await topBar.expectActiveWorkspace('Week plan')
    await expect(calendar.block('Review: chloroplast DNA')).toBeVisible()
    await expect(toast).not.toContainText('Opened')
  })

  test('leaving the board a moment opened on dismisses its "Back to ..." toast', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    await call(request, 'planItems.create', {
      kind: 'task', title: 'Review: chloroplast DNA', starts_at: at(2, 20), ends_at: at(2, 20, 30), duration_min: 30,
      course: 'biology', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 2_200_000,
    })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    await calendar.block('Review: chloroplast DNA').click()
    await calendar.popover.getByRole('button', { name: 'Go to moment' }).click()
    await topBar.expectActiveWorkspace('Evening Review')
    const toast = page.getByTestId('toast-host')
    await expect(toast).toContainText('Opened 36:40 in Evening Review')

    await topBar.switchToWorkspace('Exam Prep')
    await expect(toast).not.toContainText('Opened')
  })

  test('the automation that made a block: the footer names it, Edit opens it, and the open popover follows the change', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    // Mark a moment of the seeded Mitochondrial DNA lecture confusing: the
    // seeded confusion automation makes and places a 20-min review.
    await call(request, 'tags.create', { target_type: 'transcript_segment', target_id: 'seg-bio4-05', label: 'confused' })
    let review: PlanItemOccurrence | undefined
    await expect.poll(async () => {
      const items = await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', { sourceType: 'recording', sourceId: 'rec-bio-4', statuses: ['open'] })
      review = items.find((i) => i.source_offset_ms === 724000 && i.starts_at)
      return !!review
    }, { timeout: 15000 }).toBe(true)
    expect(review).toMatchObject({ duration_min: 20, created_by_workflow_id: 'wf-confused-review' })

    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    const weeksAhead = Math.floor((Date.parse(review!.starts_at!) - monday.getTime()) / (7 * 24 * 3600_000))
    for (let i = 0; i < weeksAhead; i++) await calendar.nextWeek()
    await calendar.block(review!.title).click()

    const popover = calendar.popover
    await expect(popover.getByTestId('calendar-moment-quote')).toContainText('You marked this confusing')
    await expect(popover).toContainText('20 min')
    const madeBy = popover.getByTestId('calendar-made-by')
    await expect(madeBy).toContainText('Made by "When I mark something confusing, add a 20-min review within 3 days".')

    await madeBy.getByRole('button', { name: 'Edit automation' }).click()
    const dialog = page.getByRole('dialog', { name: 'Automation' })
    const sentence = dialog.getByTestId('review-automation-sentence')
    await sentence.getByLabel('Review length in minutes').selectOption('30')
    // Earliest placement: it keeps its start and gets longer, or moves if 30 minutes no longer fit.
    await expect(sentence).toContainText(/Saved\. (Moved \d+ reviews? to fit|Your review is now 30 min|\d+ reviews are now 30 min)\./)
    await dialog.getByRole('button', { name: /close/i }).click()
    await expect(dialog).toBeHidden()

    // The popover left open follows the automation's change (it used to keep the old times).
    await expect(popover).toContainText('30 min')
    await expect(madeBy).toContainText('add a 30-min review within 3 days')
    const moved = await trpcQuery<PlanItemOccurrence>(request, 'planItems.byId', review!.id)
    await expect(popover).toContainText(`${hhmm(moved.starts_at!)}-${hhmm(moved.ends_at!)}`)
  })
})
