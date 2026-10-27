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
  await expect(draft.getByTestId('autofill-note')).toContainText('Biology quiz prep is due soonest, so it gets first pick of your study time.')
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

async function draftWithAssumedEstimates(page: Page) {
  const panel = await openPlan(page)
  await panel.getByTestId('autofill').click()
  await panel.getByRole('button', { name: 'Assume 1h and Auto-fill' }).click()
  await expect(panel.getByTestId('autofill-draft')).toBeVisible()
  return panel
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

test('placing a drafted to-do by hand drops its ghost, and Accept all never overwrites it', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  await expect(ghost(page, 'Biology quiz prep')).toHaveAttribute('aria-label', /08:00 - 09:00/)

  // Drag the quiz prep row onto Tuesday 09:00 while its ghost is on Monday.
  const day = await page.getByTestId('calendar-day').nth(1).boundingBox()
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).dragTo(page.getByTestId('calendar-grid'), {
    targetPosition: { x: day!.x - grid!.x + day!.width / 2, y: (9.1 / 24) * grid!.height },
  })
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(1, 9))
  await expect(ghost(page, 'Biology quiz prep')).toHaveCount(0)
  await expect(page.getByTestId('calendar-notice')).toHaveText('Took "Biology quiz prep" out of the suggestions: it already has a time.')

  await panel.getByRole('button', { name: 'Accept all' }).click()
  await expect.poll(() => stored(simulator, 'cards')?.starts_at).not.toBeNull()
  // The hand placement stands.
  expect(stored(simulator, 'quiz')).toMatchObject({ starts_at: iso(1, 9), ends_at: iso(1, 10) })
})

test('a ghost that something else now covers is taken out, and a ghost cannot be moved onto a commitment', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  seed(simulator, [{ id: 'review', title: 'Review: maternal inheritance', duration_min: 60, starts_at: iso(1, 10, 30), ends_at: iso(1, 11, 30), course: 'biology' }])
  await mount(<CalendarHarness />)
  await draftWithAssumedEstimates(page)
  const cards = ghost(page, 'Flashcards')
  await expect(cards).toHaveAttribute('aria-label', /09:15 - 10:15/)

  // Drag the scheduled review onto the Flashcards ghost (Mon 09:15).
  const review = page.getByTestId('calendar-block').filter({ hasText: 'Review: maternal inheritance' })
  const from = await review.boundingBox()
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  const hourPx = grid!.height / 24
  const mon = await page.getByTestId('calendar-day').nth(0).boundingBox()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + 6)
  await page.mouse.down()
  await page.mouse.move(mon!.x + mon!.width / 2, grid!.y + 9.25 * hourPx + 6, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => stored(simulator, 'review')?.starts_at).toBe(iso(0, 9, 15))
  await expect(cards).toHaveCount(0)
  await expect(page.getByTestId('calendar-notice')).toHaveText(
    'Took "Flashcards: organelles" out of the suggestions: that time overlaps Review: maternal inheritance.',
  )

  // The quiz ghost (Mon 08:00) can't go onto Monday's commitment from 12:00.
  const quiz = await ghost(page, 'Biology quiz prep').boundingBox()
  await page.mouse.move(quiz!.x + quiz!.width / 2, quiz!.y + 6)
  await page.mouse.down()
  await page.mouse.move(quiz!.x + quiz!.width / 2, quiz!.y + 6 + 5 * hourPx, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('calendar-notice')).toHaveText('Can\'t move "Biology quiz prep" there: that time overlaps Busy 0.')
  await expect(ghost(page, 'Biology quiz prep')).toHaveAttribute('aria-label', /08:00 - 09:00/)
})

test('changing study time per day during a draft re-drafts it; a too-long to-do always gets a trim', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  const draft = panel.getByTestId('autofill-draft')
  await expect(draft.getByTestId('autofill-trim')).toHaveText([/Shrink "Lab report write-up" to 2h\?/])

  // 1h a day (Monday and Tuesday mornings): the trim follows the new budget.
  await panel.getByLabel('Study time per day').selectOption('60')
  await expect(draft.getByTestId('autofill-trim')).toHaveText([/Shrink "Lab report write-up" to 1h\?/])
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(2)
  await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 2h of study time. 4h didn't fit.")

  await draft.getByRole('button', { name: 'Shrink to 1h' }).click()
  await expect(draft.getByTestId('autofill-unplaced')).toContainText('Flashcards: organelles (1h) - no free gap long enough')
  await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 2h of study time. 1h didn't fit.")
})

test('keyboard: nudge a ghost with the arrows and accept it with Enter; pick a time for a to-do with no slot', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  const quiz = ghost(page, 'Biology quiz prep')
  await quiz.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(quiz).toHaveAttribute('aria-label', /07:30 - 08:30/)
  await page.keyboard.press('Enter')
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(0, 7, 30))

  // The lab report is longer than a day, so it has no suggested slot: Pick a time.
  await panel.getByRole('button', { name: 'Keep my plan' }).click()
  const lab = panel.getByTestId('plan-todo').filter({ hasText: 'Lab report write-up' })
  await lab.getByRole('button', { name: 'Pick a time' }).click()
  // It starts at the first free study time ahead: Monday after the accepted quiz block.
  await expect(lab.getByLabel('Start time for Lab report write-up')).toHaveValue(toLocalInput(at(0, 8, 30)))
  await lab.getByLabel('Start time for Lab report write-up').fill(toLocalInput(at(1, 9)))
  await lab.getByRole('button', { name: 'Add' }).click()
  // 09:00-13:00 on Tuesday runs into the 12:00 commitment: refused, nothing saved.
  await expect(panel.getByText('"Lab report write-up" would overlap Busy 1 there. Pick a free time.')).toBeVisible()
  expect(stored(simulator, 'lab')?.starts_at).toBeNull()

  await lab.getByRole('button', { name: 'Pick a time' }).click()
  await lab.getByLabel('Start time for Lab report write-up').fill(toLocalInput(at(1, 7)))
  await lab.getByRole('button', { name: 'Add' }).click()
  await expect.poll(() => stored(simulator, 'lab')?.starts_at).toBe(iso(1, 7))
})

test('closing and reopening the panel keeps the draft', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  await panel.getByRole('button', { name: 'Close Help me plan' }).click()
  await expect(page.getByTestId('proposal-tray')).toBeVisible()
  await page.getByTestId('help-me-plan').click()
  await expect(panel.getByTestId('autofill-trim')).toContainText('Shrink "Lab report write-up" to 2h?')
  await expect(panel.getByTestId('autofill-note')).toBeVisible()
})

test('with nothing to plan, the panel says so calmly and Auto-fill waits', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  simulator.db.planItems = simulator.db.planItems.filter((p) => p.kind !== 'task')
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await expect(panel.getByTestId('plan-empty')).toHaveText('No to-dos waiting for a time. Add one in the To-do widget and it shows up here.')
  await expect(panel.getByTestId('autofill')).toBeDisabled()
})
