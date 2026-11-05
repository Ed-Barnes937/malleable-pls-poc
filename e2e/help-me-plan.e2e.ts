import { test, expect } from './test'
import type { APIRequestContext, Page } from '@playwright/test'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'

/**
 * Help me plan + Auto-fill (plan ticket T9), mock AI: an over-capacity week
 * gets an honest capacity line and a trim suggestion; accepting places the
 * blocks; "Keep my plan" leaves the calendar exactly as it was.
 *
 * Plans next week so the test does not depend on what day it runs.
 */

interface Row { id: string; title: string; starts_at: string | null; ends_at: string | null; duration_min: number | null }

const monday = (() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7)
})()
const at = (day: number, h: number, m = 0) =>
  new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h, m).toISOString()

async function seedWeek(request: APIRequestContext) {
  // An exact over-capacity week: start from no plan items (the reseed adds Priya's week).
  for (const item of await trpcQuery<Row[]>(request, 'planItems.list')) {
    await trpcMutation(request, 'planItems.delete', item.id)
  }
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Week plan' })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 1100, height: 680,
  })
  // A full week: free study time only Mon-Wed mornings (09:00-11:50: the study day starts at 09:00).
  for (let d = 0; d < 7; d++) {
    await trpcMutation(request, 'planItems.create', {
      kind: 'commitment', title: d < 3 ? 'Lab placement' : 'Away', subtype: 'other', starts_at: at(d, d < 3 ? 12 : 8), ends_at: at(d, 22),
    })
  }
  const todo = (title: string, duration_min: number | null, due_at: string | null, course: string) =>
    trpcMutation<{ id: string }>(request, 'planItems.create', { kind: 'task', title, duration_min, due_at, course })
  return {
    lab: await todo('Lab report write-up', 240, at(4, 17), 'chemistry'),
    quiz: await todo('Biology quiz prep', 120, at(3, 9), 'biology'),
    reading: await todo('Chemistry reading', 60, null, 'chemistry'),
    cards: await todo('Flashcards: organelles', null, null, 'biology'),
  }
}

async function openPlanner(page: Page) {
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace('Week plan')
  const calendar = new CalendarPom(page)
  await expect(calendar.grid).toBeVisible()
  await calendar.nextWeek()
  await calendar.root.getByTestId('help-me-plan').click()
  return { calendar, panel: calendar.root.getByTestId('help-me-plan-panel') }
}

const tasks = (request: APIRequestContext) => trpcQuery<Row[]>(request, 'planItems.list', { kinds: ['task'] })

test.describe('Help me plan', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('over capacity: honest note and a trim; accept places the blocks', async ({ page, request }) => {
    const ids = await seedWeek(request)
    const { calendar, panel } = await openPlanner(page)

    // 3 mornings x 2h of study time; 4h + 2h + 1h + 1h (assumed) needed.
    await expect(panel.getByTestId('plan-capacity')).toContainText('About 6 hours of study time left next week (2h a day). Your to-dos need 8.')

    // Assign one by hand first: the quiz prep goes in its first suggested slot.
    await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).getByTestId('plan-suggestion').first().click()
    await expect(calendar.block('Biology quiz prep')).toHaveAttribute('aria-label', /09:00 - 11:00/)

    await panel.getByTestId('autofill').click()
    await panel.getByRole('button', { name: 'Assume 1h and Auto-fill' }).click()
    const draft = panel.getByTestId('autofill-draft')
    await expect(draft.getByTestId('autofill-note')).toContainText('Lab report write-up is due soonest, so it gets first pick of your study time.')
    await expect(draft.getByTestId('autofill-trim')).toContainText('Lab report write-up (4h) could be shorter, so more fits.')
    // Due first, the lab report takes Tuesday's and Wednesday's 2h as two sessions; the rest doesn't fit.
    await expect(draft.getByTestId('autofill-block')).toHaveText([/Lab report write-up \(1 of 2\)/, /Lab report write-up \(2 of 2\)/])
    await expect(draft.getByTestId('autofill-unplaced')).toContainText("Chemistry reading (1h) didn't fit")
    // Nothing is written while it is a draft.
    expect((await tasks(request)).find((t) => t.id === ids.reading.id)?.starts_at).toBeNull()

    await draft.getByRole('button', { name: 'Shrink to 2h' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(3)
    await panel.getByRole('button', { name: 'Accept draft' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)

    const after = await tasks(request)
    const byId = (id: string) => after.find((t) => t.id === id)!
    expect(byId(ids.lab.id)).toMatchObject({ duration_min: 120 })
    for (const id of [ids.lab.id, ids.reading.id, ids.cards.id]) expect(byId(id).starts_at).not.toBeNull()
    await expect(calendar.block('Lab report write-up')).toBeVisible()
    await expect(calendar.block('Chemistry reading')).toBeVisible()
    await expect(calendar.block('Flashcards: organelles')).toBeVisible()
    // Mon-Wed each hold at most 2h of study time.
    const perDay = new Map<string, number>()
    for (const t of after.filter((t) => t.starts_at)) {
      const day = new Date(t.starts_at!).toDateString()
      perDay.set(day, (perDay.get(day) ?? 0) + (Date.parse(t.ends_at!) - Date.parse(t.starts_at!)) / 60_000)
    }
    for (const minutes of perDay.values()) expect(minutes).toBeLessThanOrEqual(120)
  })

  test('Auto-fill straight after placing a block by hand advises around it while it is still saving', async ({ page, request }) => {
    await seedWeek(request)
    const { calendar, panel } = await openPlanner(page)
    await expect(panel.getByTestId('plan-capacity')).toContainText('Your to-dos need 8.')

    // The quiz prep's block is held on its way to the server until the draft is in.
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/planItems.update**', async (route) => { await held; await route.continue() })
    await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).getByTestId('plan-suggestion').first().click()
    await expect(calendar.block('Biology quiz prep')).toHaveAttribute('aria-label', /09:00 - 11:00/)

    await panel.getByTestId('autofill').click()
    await panel.getByRole('button', { name: 'Assume 1h and Auto-fill' }).click()
    // The advice is about the to-dos still waiting for a time, not the quiz prep.
    const draft = panel.getByTestId('autofill-draft')
    await expect(draft.getByTestId('autofill-note')).toContainText('Lab report write-up is due soonest, so it gets first pick of your study time.')
    await expect(draft.getByTestId('autofill-trim')).toContainText('Lab report write-up (4h) could be shorter, so more fits.')
    await expect(draft.getByTestId('autofill-block').filter({ hasText: 'Biology quiz prep' })).toHaveCount(0)
    await expect(calendar.root.getByTestId('calendar-ghost').filter({ hasText: 'Biology quiz prep' })).toHaveCount(0)

    release()
    await expect.poll(async () => (await tasks(request)).find((t) => t.title === 'Biology quiz prep')?.starts_at).not.toBeNull()
  })

  /** The same week (2h of study time on each of three mornings) with these to-dos instead. */
  async function seedTodos(request: APIRequestContext, todos: ReadonlyArray<readonly [string, number]>) {
    const seeded = await seedWeek(request)
    for (const t of Object.values(seeded)) await trpcMutation(request, 'planItems.delete', t.id)
    for (const [title, duration_min] of todos) {
      await trpcMutation(request, 'planItems.create', { kind: 'task', title, duration_min, due_at: null, course: 'biology' })
    }
  }

  test('study time the draft leaves is named for why, so the draft adds up to the headline', async ({ page, request }) => {
    // Seven 45-minute to-dos (too short to split) in three 2h days: two a day, and each day keeps a 30-minute piece.
    await seedTodos(request, Array.from({ length: 7 }, (_, i) => [`Problem set ${i + 1}`, 45] as const))
    const { panel } = await openPlanner(page)
    await expect(panel.getByTestId('plan-capacity')).toContainText('About 6 hours of study time left next week (2h a day). Your to-dos need 5.5.')
    await panel.getByTestId('autofill').click()
    // 4h 30m drafted + 1h 30m in 30-minute pieces = the 6h free.
    // Each day has only 30 minutes of its 2h left: the budget binds, so it isn't blamed on short gaps.
    await expect(panel.getByTestId('autofill-summary')).toHaveText(
      "Drafted 4h 30m of study time. 45m didn't fit. The other 1h 30m is on days with too little study time left for it.",
      { timeout: 15000 },
    )
    await expect(panel.getByTestId('autofill-unplaced')).toContainText("didn't fit: too little study time left on any day.")
  })

  test('a to-do longer than a day is split into sessions, saved as blocks of its own; the to-do keeps its total', async ({ page, request }) => {
    await seedTodos(request, [['Essay draft', 180], ['Reading', 60]])
    const { calendar, panel } = await openPlanner(page)
    await expect(panel.getByTestId('plan-capacity')).toContainText('About 6 hours of study time left next week (2h a day). Your to-dos need 4.')
    await panel.getByTestId('autofill').click()
    const draft = panel.getByTestId('autofill-draft')
    await expect(draft.getByTestId('autofill-summary')).toHaveText('Drafted 4h of study time. Everything fits.', { timeout: 15000 })
    await expect(draft.getByTestId('autofill-block')).toHaveText([/Reading/, /Essay draft \(1 of 2\)/, /Essay draft \(2 of 2\)/])
    await expect(calendar.root.getByTestId('calendar-ghost').filter({ hasText: 'Essay draft (1 of 2)' })).toHaveAttribute('aria-label', /10:15 - 11:15/)
    await expect(calendar.root.getByTestId('calendar-ghost').filter({ hasText: 'Essay draft (2 of 2)' })).toHaveAttribute('aria-label', /09:00 - 11:00/)

    await panel.getByRole('button', { name: 'Accept draft' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)
    await expect(calendar.block('Essay draft')).toHaveCount(2)
    const after = await trpcQuery<(Row & { source_type: string | null; source_id: string | null })[]>(request, 'planItems.list', { kinds: ['task'] })
    const essay = after.find((t) => t.title === 'Essay draft' && !t.source_type)!
    expect(essay).toMatchObject({ starts_at: null, duration_min: 180 })
    const sessions = after.filter((t) => t.source_type === 'plan_item' && t.source_id === essay.id)
    expect(sessions.map((t) => [t.starts_at, t.ends_at, t.duration_min])).toEqual([[at(0, 10, 15), at(0, 11, 15), 60], [at(1, 9), at(1, 11), 120]])
    // All booked: it no longer waits for a time.
    await expect(panel.getByTestId('plan-todo').filter({ hasText: 'Essay draft' })).toHaveCount(0)
  })

  test('over capacity: the headline and the Auto-fill draft agree on the numbers and the daily cap', async ({ page, request }) => {
    // Every to-do fits in a day.
    await seedTodos(request, [['Essay draft', 120], ['Problem set', 120], ['Past paper', 120], ['Flashcards', 60], ['Reading', 60]])
    const { calendar, panel } = await openPlanner(page)

    await expect(panel.getByTestId('plan-capacity')).toContainText('About 6 hours of study time left next week (2h a day). Your to-dos need 8.')
    await expect(panel.getByTestId('plan-capacity-numbers')).toHaveText(/6h free\s*8h to do\s*2h short/)

    await panel.getByTestId('autofill').click()
    const draft = panel.getByTestId('autofill-draft')
    // Auto-fill fills exactly the study time the headline counts, and leaves out exactly the shortfall.
    await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 6h of study time. 2h didn't fit.", { timeout: 15000 })
    const blocks = await draft.getByTestId('autofill-block').count()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(blocks)

    await panel.getByRole('button', { name: 'Accept draft' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)
    // ...within the same 2h a day the headline names.
    const placed = (await tasks(request)).filter((t) => t.starts_at)
    expect(placed).toHaveLength(blocks)
    const perDay = new Map<string, number>()
    for (const t of placed) {
      const day = new Date(t.starts_at!).toDateString()
      perDay.set(day, (perDay.get(day) ?? 0) + (Date.parse(t.ends_at!) - Date.parse(t.starts_at!)) / 60_000)
    }
    expect([...perDay.values()].reduce((a, b) => a + b, 0)).toBe(360)
    for (const minutes of perDay.values()) expect(minutes).toBeLessThanOrEqual(120)
  })

  test('dragging a ghost straight after Accept draft never snaps back: the drag is refused or the move is saved', async ({ page, request, browserName }) => {
    await seedTodos(request, [['Essay draft', 180], ['Reading', 60]])
    // A slow device, so the saves are still in flight while the student drags.
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
    }
    const { calendar, panel } = await openPlanner(page)
    await panel.getByTestId('autofill').click()
    const ghosts = calendar.root.getByTestId('calendar-ghost')
    await expect(ghosts).toHaveCount(3, { timeout: 15000 })
    // ...and a slow network: each saved block takes a while to come back.
    await page.route(/\/trpc\/planItems\.(create|update)/, async (route) => {
      await new Promise((r) => setTimeout(r, 800))
      await route.continue()
    })
    const hourPx = (await calendar.grid.boundingBox())!.height / 24
    const titles = ['Essay draft (2 of 2)', 'Reading']
    const before = await Promise.all(titles.map(async (title) => (await ghosts.filter({ hasText: title }).boundingBox())!))

    await panel.getByRole('button', { name: 'Accept draft' }).click()
    // Straight away, each a quarter of an hour later: the last block (still
    // waiting its turn), then the first (saving, or saved and not yet back).
    for (const box of before) {
      await page.mouse.move(box.x + box.width / 2, box.y + 8)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2, box.y + 8 + hourPx / 4, { steps: 4 })
      await page.mouse.up()
    }
    // What the student sees right after the drags.
    const label = (title: string) => calendar.root.locator('[data-testid="calendar-ghost"], [data-testid="calendar-block"]')
      .filter({ hasText: title }).evaluateAll((els) => els.map((el) => /\d\d:\d\d - \d\d:\d\d/.exec(el.getAttribute('aria-label') ?? '')?.[0]).sort())
    const shown = { reading: await label('Reading'), essay: await label('Essay draft') }

    // Once every save has landed (and longer than a ghost ever waits for its block)...
    await expect(ghosts).toHaveCount(0, { timeout: 15000 })
    await page.waitForTimeout(5000)
    // ...the calendar still shows what it showed, and that is what was saved.
    expect(await label('Reading')).toEqual(shown.reading)
    expect(await label('Essay draft')).toEqual(shown.essay)
    const rows = await tasks(request)
    const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5)
    const saved = (match: (t: Row) => boolean) => rows.filter((t) => t.starts_at && match(t)).map((t) => `${hhmm(t.starts_at!)} - ${hhmm(t.ends_at!)}`).sort()
    expect(saved((t) => t.title === 'Reading')).toEqual(shown.reading)
    expect(saved((t) => t.title === 'Essay draft')).toEqual(shown.essay)
  })

  test('Keep my plan leaves the calendar unchanged', async ({ page, request }) => {
    await seedWeek(request)
    const before = await trpcQuery<Row[]>(request, 'planItems.list')
    const { calendar, panel } = await openPlanner(page)

    await panel.getByTestId('autofill').click()
    await panel.getByRole('button', { name: 'Assume 1h and Auto-fill' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost').first()).toBeVisible()
    await panel.getByRole('button', { name: 'Keep my plan' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)

    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await expect(calendar.grid).toBeVisible()
    expect(await trpcQuery<Row[]>(request, 'planItems.list')).toEqual(before)
  })
})
