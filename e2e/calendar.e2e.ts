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
    await expect(topBar.scopeChip).toContainText('Biology Lecture: Mitochondrial DNA')
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
