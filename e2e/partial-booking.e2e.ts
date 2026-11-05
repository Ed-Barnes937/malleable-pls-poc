import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import type { PlanItem } from '../packages/substrate/src'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'
import { SEED_TIME_ZONE } from './seed-week'

/**
 * Partly booked to-dos (flow audit 01b), mock AI, on Priya's seeded week on
 * a Wednesday morning: resizing a to-do's block never changes its estimate,
 * so a 2h quiz revision cut to 1h reads "1h of 2h booked" and offers Book
 * the rest; Find another time moves a block to a free slot; ticking a to-do's
 * last session offers to tick the to-do off too.
 */
const NOW = Date.parse('2026-10-28T09:00:00Z') // Wed 28 Oct 2026, 09:00 London (GMT)
const QUIZ = 'seed-todo-quiz-revision'
const QUIZ_DUE = Date.parse('2026-10-29T10:00:00Z')

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: SEED_TIME_ZONE })

const tasks = (request: APIRequestContext) => trpcQuery<PlanItem[]>(request, 'planItems.list', { kinds: ['task'] })
const sessionsOf = async (request: APIRequestContext, id: string) =>
  (await tasks(request)).filter((r) => r.source_type === 'plan_item' && r.source_id === id).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))
const byId = async (request: APIRequestContext, id: string) => (await tasks(request)).find((r) => r.id === id)!

/** A board with the Calendar and the To-do widget side by side, and the quiz revision booked Wed 14:00-16:00. */
async function openWeek(page: Page, request: APIRequestContext) {
  await page.clock.setFixedTime(NOW)
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'My week' })
  await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 900, height: 760 })
  await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType: 'todo', slotName: 'todo', pos_x: 940, pos_y: 24, width: 440, height: 760 })
  await trpcMutation(request, 'planItems.update', { id: QUIZ, patch: { starts_at: '2026-10-28T14:00:00Z', ends_at: '2026-10-28T16:00:00Z' } })
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace('My week')
  const calendar = new CalendarPom(page)
  await expect(calendar.grid).toBeVisible()
  return { calendar, todo: page.getByTestId('todo-item').filter({ hasText: 'Revise for the Biology quiz' }) }
}

/** Drags the bottom edge of `title`'s block (Wednesday) to `hours`. */
async function resizeTo(page: Page, calendar: CalendarPom, title: string, hours: number) {
  const block = calendar.block(title)
  await block.hover()
  const handle = await block.getByTestId('calendar-block-resize').boundingBox()
  if (!handle) throw new Error('no resize edge')
  const to = await calendar.point(2, hours)
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height - 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2, to.y, { steps: 8 })
  await page.mouse.up()
}

test.describe('Partly booked to-dos', () => {
  test.beforeEach(async () => { await reseed({ now: NOW }) })
  test.afterAll(async () => { await reseed() })

  test('resizing the 2h quiz block to 1h keeps the estimate, and Book the rest in To-do books 1h more before the quiz', async ({ page, request }) => {
    const { calendar, todo } = await openWeek(page, request)
    await expect(calendar.block('Revise for the Biology quiz')).toHaveAttribute('aria-label', /14:00 - 16:00/)

    await resizeTo(page, calendar, 'Revise for the Biology quiz', 15)
    await expect(calendar.block('Revise for the Biology quiz')).toHaveAttribute('aria-label', /14:00 - 15:00/)
    await expect(todo.getByTestId('todo-booked')).toHaveText('1h of 2h booked')
    await expect.poll(async () => (await byId(request, QUIZ)).ends_at).toBe('2026-10-28T15:00:00.000Z')
    expect(await byId(request, QUIZ)).toMatchObject({ duration_min: 120 })

    await todo.getByRole('button', { name: 'Book the rest of Revise for the Biology quiz' }).click()
    const draft = todo.getByTestId('book-the-rest')
    await expect(draft.getByTestId('book-the-rest-block')).toHaveCount(1)
    // Nothing is saved until the student says so.
    expect(await sessionsOf(request, QUIZ)).toEqual([])
    await draft.getByRole('button', { name: 'Book it' }).click()
    await expect(draft).toHaveCount(0)

    // A second booking: the to-do's own block became a session too, so each can be ticked on its own.
    await expect.poll(async () => (await sessionsOf(request, QUIZ)).length).toBe(2)
    const both = await sessionsOf(request, QUIZ)
    const own = both.find((r) => r.starts_at === '2026-10-28T14:00:00.000Z')
    const rest = both.find((r) => r !== own)!
    expect(own).toMatchObject({ starts_at: '2026-10-28T14:00:00.000Z', ends_at: '2026-10-28T15:00:00.000Z', status: 'open' })
    expect(rest.duration_min).toBe(60)
    expect(Date.parse(rest.ends_at!)).toBeLessThanOrEqual(QUIZ_DUE)
    expect(await byId(request, QUIZ)).toMatchObject({ starts_at: null, duration_min: 120, status: 'open' })
    await expect(todo.getByTestId('todo-booked')).toHaveCount(0)
    await expect(calendar.block('Revise for the Biology quiz')).toHaveCount(2)
  })

  test('Book the rest in Plan your time drafts the other 1h before the quiz, saved on Accept', async ({ page, request }) => {
    const { calendar } = await openWeek(page, request)
    await resizeTo(page, calendar, 'Revise for the Biology quiz', 15)
    await expect.poll(async () => (await byId(request, QUIZ)).ends_at).toBe('2026-10-28T15:00:00.000Z')

    await calendar.root.getByTestId('help-me-plan').click()
    const plan = calendar.root.getByTestId('help-me-plan-panel')
    const row = plan.getByTestId('plan-todo').filter({ hasText: 'Revise for the Biology quiz' })
    await expect(row.getByTestId('plan-booked')).toHaveText('1h of 2h booked')
    await row.getByRole('button', { name: 'Book the rest of Revise for the Biology quiz' }).click()

    const ghost = calendar.root.getByTestId('calendar-ghost')
    await expect(ghost).toHaveCount(1)
    await expect(ghost).toContainText('Revise for the Biology quiz')
    await expect(plan.getByTestId('autofill-block')).toHaveCount(1)
    expect(await sessionsOf(request, QUIZ)).toEqual([])

    await plan.getByRole('button', { name: 'Accept draft' }).click()
    await expect(ghost).toHaveCount(0)
    await expect.poll(async () => (await sessionsOf(request, QUIZ)).length).toBe(2)
    const sessions = await sessionsOf(request, QUIZ)
    expect(sessions.reduce((sum, s) => sum + s.duration_min!, 0)).toBe(120)
    for (const s of sessions) expect(Date.parse(s.ends_at!)).toBeLessThanOrEqual(QUIZ_DUE)
    expect(await byId(request, QUIZ)).toMatchObject({ starts_at: null, duration_min: 120 })
    // All booked: it leaves the list.
    await expect(row).toHaveCount(0)
  })

  test('Find another time on the Saturday block offers free slots elsewhere, and picking one moves it', async ({ page, request }) => {
    const { calendar } = await openWeek(page, request)
    const reading = calendar.block('Biology reading: chapter 4')
    await expect(reading).toHaveAttribute('aria-label', /10:00 - 11:00/)
    await reading.click()
    const popover = calendar.popover
    await popover.getByRole('button', { name: 'Find another time' }).click()
    const slots = popover.getByTestId('another-time-slot')
    await expect(slots.first()).toBeVisible()
    const count = await slots.count()
    expect(count).toBeGreaterThanOrEqual(2)
    expect(count).toBeLessThanOrEqual(3)
    await expect(slots.filter({ hasText: /^Sat 10:00$/ })).toHaveCount(0)

    const label = (await slots.first().textContent())!
    await slots.first().click()
    await expect(popover).toHaveCount(0)
    const moved = await byId(request, 'seed-study-bio-reading')
    expect(moved.starts_at).not.toBe('2026-10-31T10:00:00.000Z')
    expect(Date.parse(moved.ends_at!) - Date.parse(moved.starts_at!)).toBe(60 * 60_000)
    expect(label).toMatch(/^(Today|Thu|Fri|Sat|Sun) \d\d:\d\d$/)
    await expect(calendar.block('Biology reading: chapter 4')).toHaveCount(1)
  })

  test("ticking a to-do's last open session offers to tick the to-do off too", async ({ page, request }) => {
    const { calendar } = await openWeek(page, request)
    // Two sessions: the 14:00 block and one on Thursday morning.
    await trpcMutation(request, 'planItems.create', {
      kind: 'task', title: 'Revise for the Biology quiz', course: 'biology', due_at: new Date(QUIZ_DUE).toISOString(),
      starts_at: '2026-10-29T09:00:00Z', ends_at: '2026-10-29T09:45:00Z', duration_min: 45, source_type: 'plan_item', source_id: QUIZ,
    })
    // Arranged behind the page's back: load it again (it reopens on this board).
    await page.reload()
    await expect(calendar.block('Revise for the Biology quiz')).toHaveCount(2)
    const [first, second] = await sessionsOf(request, QUIZ)

    // Not the last one: ticking it just ticks it.
    await calendar.block('Revise for the Biology quiz').first().click()
    await calendar.popover.getByRole('button', { name: 'Mark done' }).click()
    await expect(calendar.popover).toHaveCount(0)
    await expect.poll(async () => (await byId(request, first.id)).status).toBe('done')

    await calendar.block('Revise for the Biology quiz').last().click()
    await calendar.popover.getByRole('button', { name: 'Mark done' }).click()
    const offer = calendar.popover.getByTestId('tick-todo-too')
    await expect(offer).toContainText('Tick off Revise for the Biology quiz too?')
    expect(await byId(request, second.id)).toMatchObject({ status: 'done' })
    expect(await byId(request, QUIZ)).toMatchObject({ status: 'open' })
    await offer.getByRole('button', { name: 'Tick it off' }).click()
    await expect(calendar.popover).toHaveCount(0)
    await expect.poll(async () => (await byId(request, QUIZ)).status).toBe('done')
  })
})
