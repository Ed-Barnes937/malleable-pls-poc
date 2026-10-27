import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
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
  // A full week: free study time only Mon-Wed mornings (08:00-11:50).
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
    await expect(panel.getByTestId('plan-capacity')).toContainText('About 6 hours of study time left next week. Your to-dos need 8.')

    // Assign one by hand first: the quiz prep goes in its first suggested slot.
    await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).getByTestId('plan-suggestion').first().click()
    await expect(calendar.block('Biology quiz prep')).toHaveAttribute('aria-label', /08:00 - 10:00/)

    await panel.getByTestId('autofill').click()
    await panel.getByRole('button', { name: 'Assume 1h and Auto-fill' }).click()
    const draft = panel.getByTestId('autofill-draft')
    await expect(draft.getByTestId('autofill-note')).toContainText('Lab report write-up is due soonest, so it gets first pick of your study time.')
    await expect(draft.getByTestId('autofill-trim')).toContainText('Shrink "Lab report write-up" to 2h?')
    await expect(draft.getByTestId('autofill-unplaced')).toContainText('Lab report write-up (4h)')
    // Nothing is written while it is a draft.
    expect((await tasks(request)).find((t) => t.id === ids.reading.id)?.starts_at).toBeNull()

    await draft.getByRole('button', { name: 'Shrink to 2h' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(3)
    await draft.getByRole('button', { name: 'Accept all' }).click()
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
