import { test, expect, type APIRequestContext } from '@playwright/test'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { apiUrl } from './ports'

/**
 * Calendar widget journeys (plan ticket T5): a weekly class repeats, study
 * time drags, and a study block from a lecture moment lands on that moment
 * in the Transcript, on this board or on another one.
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

  test('drag study time to a new slot', async ({ page, request }) => {
    await board(request, 'Week plan', ['calendar'])
    const task = await call(request, 'planItems.create', {
      kind: 'task', title: 'Revise respiration', starts_at: at(2, 16), ends_at: at(2, 17), duration_min: 60, course: 'biology',
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Week plan')
    const calendar = new CalendarPom(page)
    await expect(calendar.block('Revise respiration')).toBeVisible()

    await calendar.drag({ dayIndex: 2, hours: 16.25 }, { dayIndex: 4, hours: 10.25 })
    await expect(calendar.block('Revise respiration')).toHaveAttribute('aria-label', /10:00 - 11:00/)

    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await expect(calendar.block('Revise respiration')).toHaveAttribute('aria-label', /10:00 - 11:00/)
    const res = await request.get(`${apiUrl}/planItems.byId?input=${encodeURIComponent(JSON.stringify({ json: task.id }))}`, { headers })
    const stored = (await res.json()).result.data.json
    expect(stored).toMatchObject({ starts_at: at(4, 10), ends_at: at(4, 11), duration_min: 60 })
  })

  test('click a study block from a lecture moment and land on the transcript moment', async ({ page, request }) => {
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
    await expect(transcript.getByText('Select a recording to view transcript')).toBeVisible()

    await calendar.block('Review: chloroplast DNA').click()

    const moment = transcript.locator('[data-moment]')
    await expect(moment).toContainText('chloroplast DNA', { timeout: 10000 })
    await expect(moment).toBeInViewport()
    await expect(topBar.scopeChip).toContainText('Biology Lecture: Mitochondrial DNA')
    await expect(calendar.root.getByTestId('calendar-moment')).toContainText('Showing this moment in the Transcript.')
    // The calendar now highlights the block linked to the focused lecture.
    await expect(calendar.block('Review: chloroplast DNA')).toHaveAttribute('data-linked', 'true')
  })

  test('from a board without a Transcript, open the moment in one that has it', async ({ page, request }) => {
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
    const moment = calendar.root.getByTestId('calendar-moment')
    await expect(moment).toContainText('This board has no Transcript.')
    await moment.getByRole('button', { name: 'Open in a board with Transcript' }).click()

    // The first board (in tab order) with a Transcript focused on that lecture.
    await topBar.expectActiveWorkspace('Evening Review')
    const transcript = new PanelGridPom(page).panelByLabel('Transcript')
    await expect(transcript.locator('[data-moment]')).toContainText('chloroplast DNA', { timeout: 10000 })
    await expect(transcript.locator('[data-moment]')).toBeInViewport()
  })
})
