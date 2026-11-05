import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'

/**
 * Flow audit 03: the student's big changes are confirmed with Undo, and
 * Undo puts them back exactly, on the server, so a reload shows them back.
 * Pending work (a review being planned) resolves in place.
 */

interface Item { id: string; title: string; kind: string; status: string; starts_at: string | null; ends_at: string | null; duration_min: number | null; recurrence: unknown; course: string | null }
interface Panel { id: string; lens_type: string; slot_name: string; config: Record<string, unknown>; pos_x: number; pos_y: number; width: number; height: number }

async function board(request: APIRequestContext, name: string, panels: { lensType: string; x: number; width: number; config?: Record<string, unknown> }[]) {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name })
  for (const p of panels) {
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType: p.lensType, slotName: p.lensType, config: p.config ?? {}, pos_x: p.x, pos_y: 24, width: p.width, height: 600 })
  }
  return ws.id
}

async function open(page: Page, name: string) {
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace(name)
}

const toast = (page: Page) => page.getByTestId('toast')

test.describe('Undo', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('removing a widget: Undo puts it back where it was, with its settings, after a reload too', async ({ page, request }) => {
    const id = await board(request, 'Undo board', [
      { lensType: 'calendar', x: 24, width: 820, config: { view: 'day' } },
      { lensType: 'todo', x: 868, width: 400 },
    ])
    const before = (await trpcQuery<Panel[]>(request, 'workspaces.panels', id)).find((p) => p.lens_type === 'calendar')!
    await open(page, 'Undo board')
    const grid = new PanelGridPom(page)

    await page.getByRole('button', { name: 'Remove Calendar from board' }).click()
    await expect(grid.panelByLabel('Calendar')).toHaveCount(0)
    await expect(toast(page)).toContainText('Calendar removed')
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(grid.panelByLabel('Calendar')).toBeVisible()

    await page.reload()
    await expect(grid.panelByLabel('Calendar')).toBeVisible()
    const after = (await trpcQuery<Panel[]>(request, 'workspaces.panels', id)).find((p) => p.lens_type === 'calendar')!
    expect(after).toMatchObject({ slot_name: before.slot_name, config: before.config, pos_x: before.pos_x, pos_y: before.pos_y, width: before.width, height: before.height })
  })

  test('deleting a weekly class: Undo brings back the whole series, after a reload too', async ({ page, request }) => {
    // Priya's Biology lectures are two weekly series (Mon and Wed).
    const series = (await trpcQuery<Item[]>(request, 'planItems.list', { kinds: ['commitment'] })).filter((i) => i.title === 'Biology lecture' && i.recurrence)
    expect(series).toHaveLength(2)
    await board(request, 'Undo board', [{ lensType: 'calendar', x: 24, width: 900 }])
    await open(page, 'Undo board')
    const calendar = new CalendarPom(page)
    await expect(calendar.block('Biology lecture')).toHaveCount(2)

    await calendar.block('Biology lecture').first().click()
    await calendar.popover.getByRole('button', { name: 'Delete' }).click()
    await calendar.popover.getByRole('button', { name: 'Delete every week?' }).click()
    await expect(calendar.block('Biology lecture')).toHaveCount(1)
    await expect(toast(page)).toContainText('Deleted "Biology lecture"')
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(calendar.block('Biology lecture')).toHaveCount(2)

    await page.reload()
    await expect(calendar.block('Biology lecture')).toHaveCount(2)
    const after = (await trpcQuery<Item[]>(request, 'planItems.list', { kinds: ['commitment'] })).filter((i) => i.title === 'Biology lecture' && i.recurrence)
    expect(after).toEqual(series)
  })

  test('removing a to-do: Undo brings it back, after a reload too', async ({ page, request }) => {
    const todo = await trpcMutation<Item>(request, 'planItems.create', { kind: 'task', title: 'Flashcards: enzymes', duration_min: 30 })
    await board(request, 'Undo board', [{ lensType: 'todo', x: 24, width: 420 }])
    await open(page, 'Undo board')
    const list = new PanelGridPom(page).panelByLabel('To-do')

    await list.getByRole('button', { name: 'Not doing: Flashcards: enzymes' }).click()
    await expect(list.getByText('Flashcards: enzymes')).toHaveCount(0)
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(list.getByText('Flashcards: enzymes')).toBeVisible()

    await page.reload()
    await expect(list.getByText('Flashcards: enzymes')).toBeVisible()
    expect(await trpcQuery<Item>(request, 'planItems.byId', todo.id)).toMatchObject({ status: 'open', duration_min: 30 })
  })

  test('Accept draft: one Undo takes the whole draft back out, after a reload too', async ({ page, request }) => {
    const tasks = async () => (await trpcQuery<Item[]>(request, 'planItems.list', { kinds: ['task'] }))
      .map((t) => [t.id, t.starts_at, t.ends_at, t.duration_min])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const before = await tasks()
    await board(request, 'Undo board', [{ lensType: 'calendar', x: 24, width: 1100 }])
    await open(page, 'Undo board')
    const calendar = new CalendarPom(page)

    await calendar.root.getByTestId('help-me-plan').click()
    const plan = calendar.root.getByTestId('help-me-plan-panel')
    await plan.getByTestId('autofill').click()
    await expect(calendar.root.getByTestId('calendar-ghost').first()).toBeVisible()
    await plan.getByRole('button', { name: 'Accept draft' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)
    await expect(toast(page)).toContainText(/Added (\d+ blocks|".+") to your plan/)
    await expect.poll(tasks).not.toEqual(before)

    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(tasks).toEqual(before)
    await page.reload()
    await expect(calendar.root).toBeVisible()
    expect(await tasks()).toEqual(before)
  })
})

test.describe('A review being planned', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('marking a moment confusing says a review is being planned, which becomes its time in place', async ({ page, request }) => {
    const id = await board(request, 'Review board', [{ lensType: 'transcript', x: 24, width: 600, config: { mode: 'review' } }])
    // The lecture brings its course (Chemistry).
    await trpcMutation(request, 'workspaces.setBoardScope', { workspaceId: id, lectureId: 'lec-rec-chem-1' })
    await open(page, 'Review board')
    const transcript = new PanelGridPom(page).panelByLabel('Transcript')

    const moment = transcript.locator('[data-segment-id="seg-chem1-01"]')
    await moment.getByText(/Good afternoon. Today we begin organic reactions/).click()
    await transcript.getByRole('button', { name: 'Confused', exact: true }).click()
    await expect(moment.getByTestId('review-chip-pending')).toHaveText('Planning a review...')
    // The automation's answer takes its place: when the review is planned.
    await expect(moment.getByTestId('review-chip')).toContainText(/Review (planned · .+|on your to-do list)/, { timeout: 15000 })
    await expect(moment.getByTestId('review-chip-pending')).toHaveCount(0)
  })
})
