import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { CalendarHarness } from '../../../playwright/calendar-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import type { StoredPlanItem } from '../../../playwright/backend-simulator/in-memory-db'
import { startOfWeek } from './time'

// Plans next week, so "now" never eats into the free time being tested.
const monday = startOfWeek(new Date())
const at = (day: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7 + day, h, m)
const iso = (day: number, h: number, m = 0) => at(day, h, m).toISOString()

function seed(simulator: BackendSimulator, rows: (Partial<StoredPlanItem> & { id: string; course?: string })[]) {
  for (const { course, ...row } of rows) {
    simulator.db.planItems.push({
      kind: 'task', title: row.id, starts_at: null, ends_at: null, due_at: null, duration_min: null,
      status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null,
      source_offset_ms: null, created_at: iso(-7, 0), updated_at: iso(-7, 0),
      ...row,
    } as StoredPlanItem)
    if (course) simulator.db.tags.push({ id: `tag-${row.id}`, target_type: 'plan_item', target_id: row.id, label: course, created_at: iso(-7, 0) })
  }
}

/** Busy all week except Monday and Tuesday 08:00-12:00 (2h a day of study time each, by default). */
function seedBusyWeek(simulator: BackendSimulator) {
  seed(simulator, Array.from({ length: 7 }, (_, d) => ({
    id: `busy-${d}`, kind: 'commitment' as const, title: `Busy ${d}`, starts_at: iso(d, d < 2 ? 12 : 8), ends_at: iso(d, 22),
  })))
  seed(simulator, [
    { id: 'lab', title: 'Lab report write-up', duration_min: 240, due_at: iso(4, 17), course: 'chemistry' },
    { id: 'quiz', title: 'Biology quiz prep', duration_min: 60, due_at: iso(3, 9), course: 'biology' },
    { id: 'cards', title: 'Flashcards: organelles', course: 'biology' },
  ])
}

async function openPlan(page: Page) {
  await page.getByRole('button', { name: 'Next week' }).click()
  await page.getByTestId('help-me-plan').click()
  return page.getByTestId('help-me-plan-panel')
}

const ghost = (page: Page, title: string) => page.getByTestId('calendar-ghost').filter({ hasText: title })
const stored = (simulator: BackendSimulator, id: string) => simulator.db.planItems.find((p) => p.id === id)

test('shows the unscheduled to-dos, study time left and an honest capacity line', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)

  await expect(panel.getByTestId('plan-capacity')).toContainText(
    'About 4 hours of study time left next week. Your to-dos need 6.',
  )
  await expect(panel.getByTestId('plan-capacity')).toContainText('Counting 1h for the to-do with no estimate.')
  // Soonest due first.
  await expect(panel.getByTestId('plan-todo')).toHaveText([/Biology quiz prep/, /Lab report write-up/, /Flashcards/])
  await expect(page.getByTestId('calendar-free').first()).toBeVisible()

  // An estimate for the one without is saved on the to-do.
  await panel.getByRole('button', { name: 'Estimate 30m for Flashcards: organelles' }).click()
  await expect.poll(() => stored(simulator, 'cards')?.duration_min).toBe(30)

  // The study-time setting changes the numbers.
  await panel.getByLabel('Study time per day').selectOption('60')
  await expect(panel.getByTestId('plan-capacity')).toContainText('About 2 hours of study time left next week.')
})

test('pick a suggested slot to assign a to-do by hand', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  const quiz = panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' })
  await quiz.getByTestId('plan-suggestion').first().click()
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(0, 8))
  expect(stored(simulator, 'quiz')).toMatchObject({ ends_at: iso(0, 9), duration_min: 60 })
  await expect(page.getByTestId('calendar-block').filter({ hasText: 'Biology quiz prep' })).toBeVisible()
})

test('drag a to-do onto the grid to assign it', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  const day = await page.getByTestId('calendar-day').nth(1).boundingBox()
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).dragTo(page.getByTestId('calendar-grid'), {
    targetPosition: { x: day!.x - grid!.x + day!.width / 2, y: (9.1 / 24) * grid!.height },
  })
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(1, 9))
  expect(stored(simulator, 'quiz')).toMatchObject({ ends_at: iso(1, 10) })
})

test('Auto-fill drafts ghosts with a trim suggestion; accept one, adjust one, keep the rest out', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)

  await panel.getByTestId('autofill').click()
  await expect(panel.getByTestId('estimate-prompt')).toContainText('1 to-do has no estimate yet')
  await panel.getByRole('button', { name: 'Assume 1h and Auto-fill' }).click()

  const draft = panel.getByTestId('autofill-draft')
  await expect(draft.getByTestId('autofill-note')).toContainText('Biology quiz prep is due soonest, so it goes first.')
  await expect(draft.getByTestId('autofill-trim')).toContainText('Shrink "Lab report write-up" to 2h?')
  await expect(draft.getByTestId('autofill-unplaced')).toContainText('Lab report write-up (4h) - longer than your 2h a day')
  await expect(draft).toContainText('Assumed 1h for Flashcards: organelles')
  await expect(ghost(page, 'Biology quiz prep')).toHaveAttribute('aria-label', /08:00 - 09:00/)
  await expect(ghost(page, 'Flashcards')).toHaveAttribute('aria-label', /09:15 - 10:15/)
  // Nothing is saved yet.
  expect(stored(simulator, 'quiz')?.starts_at).toBeNull()

  // Shrink the lab report: it now fits on Tuesday.
  await draft.getByRole('button', { name: 'Shrink to 2h' }).click()
  await expect(ghost(page, 'Lab report write-up')).toHaveAttribute('aria-label', /08:00 - 10:00/)
  await expect(draft).toContainText('Shrunk "Lab report write-up" to 2h.')

  // Accept just the quiz block.
  await ghost(page, 'Biology quiz prep').hover()
  await page.getByRole('button', { name: 'Accept Biology quiz prep' }).click()
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(0, 8))
  await expect(page.getByTestId('calendar-block').filter({ hasText: 'Biology quiz prep' })).toBeVisible()
  await expect(ghost(page, 'Biology quiz prep')).toHaveCount(0)

  // Drag the lab report ghost an hour later, then accept it: the dragged time is saved.
  const lab = await ghost(page, 'Lab report write-up').boundingBox()
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  const hourPx = grid!.height / 24
  await page.mouse.move(lab!.x + lab!.width / 2, lab!.y + 8)
  await page.mouse.down()
  await page.mouse.move(lab!.x + lab!.width / 2, lab!.y + 8 + hourPx, { steps: 6 })
  await page.mouse.up()
  await expect(ghost(page, 'Lab report write-up')).toHaveAttribute('aria-label', /09:00 - 11:00/)
  await page.getByRole('button', { name: 'Accept Lab report write-up' }).click()
  await expect.poll(() => stored(simulator, 'lab')?.starts_at).toBe(iso(1, 9))
  expect(stored(simulator, 'lab')).toMatchObject({ ends_at: iso(1, 11), duration_min: 120 })

  // Keep my plan: the last ghost goes, and its to-do stays unscheduled.
  await draft.getByRole('button', { name: 'Keep my plan' }).click()
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(0)
  expect(stored(simulator, 'cards')).toMatchObject({ starts_at: null, duration_min: null })
})

test('dismissing a whole draft leaves the calendar as it was', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  seed(simulator, [{ id: 'cards-est', title: 'Read chapter 2', duration_min: 30 }])
  simulator.db.planItems = simulator.db.planItems.filter((p) => p.id !== 'cards')
  const before = JSON.stringify(simulator.db.planItems)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await panel.getByTestId('autofill').click()
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(2)
  await panel.getByRole('button', { name: 'Keep my plan' }).click()
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(0)
  await expect(panel.getByTestId('autofill')).toBeVisible()
  expect(JSON.stringify(simulator.db.planItems)).toBe(before)
})
