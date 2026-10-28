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

/** Busy all week except Monday and Tuesday 09:00-13:00 (2h a day of study time each, by default). */
function seedBusyWeek(simulator: BackendSimulator) {
  seed(simulator, Array.from({ length: 7 }, (_, d) => ({
    id: `busy-${d}`, kind: 'commitment' as const, title: `Busy ${d}`, starts_at: iso(d, d < 2 ? 13 : 9), ends_at: iso(d, 22),
  })))
  seed(simulator, [
    { id: 'lab', title: 'Lab report write-up', duration_min: 240, due_at: iso(4, 18), course: 'chemistry' },
    { id: 'quiz', title: 'Biology quiz prep', duration_min: 60, due_at: iso(3, 10), course: 'biology' },
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
    'About 4 hours of study time left next week (2h a day). Your to-dos need 6.',
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
  await expect(panel.getByTestId('plan-capacity')).toContainText('About 2 hours of study time left next week (1h a day).')
})

test('pick a suggested slot to assign a to-do by hand', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  const quiz = panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' })
  await quiz.getByTestId('plan-suggestion').first().click()
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(0, 9))
  expect(stored(simulator, 'quiz')).toMatchObject({ ends_at: iso(0, 10), duration_min: 60 })
  await expect(page.getByTestId('calendar-block').filter({ hasText: 'Biology quiz prep' })).toBeVisible()
})

test('drag a to-do onto the grid to assign it', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  const day = await page.getByTestId('calendar-day').nth(1).boundingBox()
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).dragTo(page.getByTestId('calendar-grid'), {
    targetPosition: { x: day!.x - grid!.x + day!.width / 2, y: (10.1 / 24) * grid!.height },
  })
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(1, 10))
  expect(stored(simulator, 'quiz')).toMatchObject({ ends_at: iso(1, 11) })
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
  await expect(draft.getByTestId('autofill-trim')).toContainText('Lab report write-up (4h) is too long for one day.')
  await expect(draft.getByRole('button', { name: 'Split across days' })).toHaveCount(0)
  await expect(draft.getByTestId('autofill-unplaced')).toContainText("Lab report write-up (4h) didn't fit: longer than your 2h a day.")
  await expect(draft).toContainText('Assumed 1h for Flashcards: organelles')
  await expect(ghost(page, 'Biology quiz prep')).toHaveAttribute('aria-label', /09:00 - 10:00/)
  await expect(ghost(page, 'Flashcards')).toHaveAttribute('aria-label', /10:15 - 11:15/)
  // Nothing is saved yet.
  expect(stored(simulator, 'quiz')?.starts_at).toBeNull()

  // Shrink the lab report: it now fits on Tuesday.
  await draft.getByRole('button', { name: 'Shrink to 2h' }).click()
  await expect(ghost(page, 'Lab report write-up')).toHaveAttribute('aria-label', /09:00 - 11:00/)
  await expect(draft).toContainText('Shrunk Lab report write-up to 2h.')

  // Accept just the quiz block.
  await ghost(page, 'Biology quiz prep').hover()
  await page.getByRole('button', { name: 'Accept Biology quiz prep' }).click()
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(0, 9))
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
  await expect(ghost(page, 'Lab report write-up')).toHaveAttribute('aria-label', /10:00 - 12:00/)
  await page.getByRole('button', { name: 'Accept Lab report write-up' }).click()
  await expect.poll(() => stored(simulator, 'lab')?.starts_at).toBe(iso(1, 10))
  expect(stored(simulator, 'lab')).toMatchObject({ ends_at: iso(1, 12), duration_min: 120 })

  // Keep my plan: the last ghost goes, and its to-do stays unscheduled.
  await panel.getByRole('button', { name: 'Keep my plan' }).click()
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

test('placing a drafted to-do by hand drops its ghost, and Accept draft never overwrites it', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  await expect(ghost(page, 'Biology quiz prep')).toHaveAttribute('aria-label', /09:00 - 10:00/)

  // Drag the quiz prep row onto Tuesday 10:00 while its ghost is on Monday.
  const day = await page.getByTestId('calendar-day').nth(1).boundingBox()
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).dragTo(page.getByTestId('calendar-grid'), {
    targetPosition: { x: day!.x - grid!.x + day!.width / 2, y: (10.1 / 24) * grid!.height },
  })
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(1, 10))
  await expect(ghost(page, 'Biology quiz prep')).toHaveCount(0)
  await expect(page.getByTestId('calendar-notice')).toHaveText('Took "Biology quiz prep" out of the suggestions: it already has a time.')

  await panel.getByRole('button', { name: 'Accept draft' }).click()
  await expect.poll(() => stored(simulator, 'cards')?.starts_at).not.toBeNull()
  // The hand placement stands.
  expect(stored(simulator, 'quiz')).toMatchObject({ starts_at: iso(1, 10), ends_at: iso(1, 11) })
})

test('a ghost that something else now covers is taken out, and a ghost cannot be moved onto a commitment', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  seed(simulator, [{ id: 'review', title: 'Review: maternal inheritance', duration_min: 60, starts_at: iso(1, 11, 30), ends_at: iso(1, 12, 30), course: 'biology' }])
  await mount(<CalendarHarness />)
  await draftWithAssumedEstimates(page)
  const cards = ghost(page, 'Flashcards')
  await expect(cards).toHaveAttribute('aria-label', /10:15 - 11:15/)

  // Drag the scheduled review onto the Flashcards ghost (Mon 10:15).
  const review = page.getByTestId('calendar-block').filter({ hasText: 'Review: maternal inheritance' })
  const from = await review.boundingBox()
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  const hourPx = grid!.height / 24
  const mon = await page.getByTestId('calendar-day').nth(0).boundingBox()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + 6)
  await page.mouse.down()
  await page.mouse.move(mon!.x + mon!.width / 2, grid!.y + 10.25 * hourPx + 6, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => stored(simulator, 'review')?.starts_at).toBe(iso(0, 10, 15))
  await expect(cards).toHaveCount(0)
  await expect(page.getByTestId('calendar-notice')).toHaveText(
    'Took "Flashcards: organelles" out of the suggestions: that time overlaps Review: maternal inheritance.',
  )

  // The quiz ghost (Mon 09:00) can't go onto Monday's commitment from 13:00.
  const quiz = await ghost(page, 'Biology quiz prep').boundingBox()
  await page.mouse.move(quiz!.x + quiz!.width / 2, quiz!.y + 6)
  await page.mouse.down()
  await page.mouse.move(quiz!.x + quiz!.width / 2, quiz!.y + 6 + 5 * hourPx, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('calendar-notice')).toHaveText('Can\'t move "Biology quiz prep" there: that time overlaps Busy 0.')
  await expect(ghost(page, 'Biology quiz prep')).toHaveAttribute('aria-label', /09:00 - 10:00/)
})

test('Shrink and Undo hand keyboard focus to each other', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  const draft = panel.getByTestId('autofill-draft')
  const shrink = draft.getByRole('button', { name: 'Shrink to 2h' })
  await shrink.focus()
  await page.keyboard.press('Enter')
  await expect(draft.getByRole('button', { name: 'Undo' })).toBeFocused()
  // A polite live region announces it for screen readers.
  await expect(draft.getByRole('status')).toHaveText(/^Shrunk Lab report write-up to 2h\.$/)
  await page.keyboard.press('Enter')
  await expect(draft.getByRole('button', { name: 'Shrink to 2h' })).toBeFocused()
})

test('changing study time per day during a draft re-drafts it; a too-long to-do always gets a trim', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  const draft = panel.getByTestId('autofill-draft')
  await expect(draft.getByTestId('autofill-trim')).toHaveText([/Lab report write-up \(4h\) is too long for one day\.\s*Shrink to 2h/])

  // 1h a day (Monday and Tuesday mornings): the trim follows the new budget.
  await panel.getByLabel('Study time per day').selectOption('60')
  await expect(draft.getByTestId('autofill-trim')).toHaveText([/Lab report write-up \(4h\) is too long for one day\.\s*Shrink to 1h/])
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(2)
  await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 2h of study time. 4h didn't fit.")

  await draft.getByRole('button', { name: 'Shrink to 1h' }).click()
  await expect(draft.getByTestId('autofill-unplaced')).toContainText("Flashcards: organelles (1h) didn't fit: no free gap long enough.")
  await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 2h of study time. 1h didn't fit.")

  // 3h a day: the offer is the new day length, not the 2h the advice said.
  await draft.getByRole('button', { name: 'Undo' }).click()
  await panel.getByLabel('Study time per day').selectOption('180')
  await expect(draft.getByTestId('autofill-trim')).toHaveText([/Lab report write-up \(4h\) is too long for one day\.\s*Shrink to 3h/])
  await expect(draft.getByRole('button', { name: 'Shrink to 3h' })).toBeVisible()
})

test('arrow keys hop a ghost past whatever is in the way, within its day', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  await draftWithAssumedEstimates(page)
  const quiz = ghost(page, 'Biology quiz prep')
  await expect(quiz).toHaveAttribute('aria-label', /09:00 - 10:00/)
  await expect(ghost(page, 'Flashcards')).toHaveAttribute('aria-label', /10:15 - 11:15/)
  await quiz.focus()
  await page.keyboard.press('ArrowDown')
  await expect(quiz).toHaveAttribute('aria-label', /09:15 - 10:15/)
  // 09:30 would overlap the Flashcards ghost: it hops past it.
  await page.keyboard.press('ArrowDown')
  await expect(quiz).toHaveAttribute('aria-label', /11:15 - 12:15/)
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await expect(quiz).toHaveAttribute('aria-label', /12:00 - 13:00/)
  // Monday is busy from 13:00 to 22:00: past the commitment in one step.
  await page.keyboard.press('ArrowDown')
  await expect(quiz).toHaveAttribute('aria-label', /22:00 - 23:00/)
  await expect(quiz).toBeFocused()
  // And back up past it.
  await page.keyboard.press('ArrowUp')
  await expect(quiz).toHaveAttribute('aria-label', /12:00 - 13:00/)
})

test('"Pick a time" starts at the first free gap long enough for the to-do', async ({ mount, page, simulator }) => {
  // Monday has only 09:00-09:30 free; Tuesday 09:00-11:00.
  seed(simulator, Array.from({ length: 7 }, (_, d) => ({
    id: `busy-${d}`, kind: 'commitment' as const, title: `Busy ${d}`, starts_at: iso(d, d === 0 ? 9 : d === 1 ? 11 : 9, d === 0 ? 30 : 0), ends_at: iso(d, 22),
  })))
  seed(simulator, [{ id: 'essay', title: 'Essay plan', duration_min: 90 }])
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  const essay = panel.getByTestId('plan-todo').filter({ hasText: 'Essay plan' })
  await essay.getByRole('button', { name: /Other time|Pick a time/ }).click()
  await expect(essay.getByLabel('Start time for Essay plan')).toHaveValue(toLocalInput(at(1, 9)))
})

test('keyboard: nudge a ghost with the arrows and accept it with Enter; pick a time for a to-do with no slot', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  const quiz = ghost(page, 'Biology quiz prep')
  await quiz.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(quiz).toHaveAttribute('aria-label', /08:30 - 09:30/)
  await page.keyboard.press('Enter')
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(0, 8, 30))

  // The lab report is longer than a day, so it has no suggested slot: Pick a time.
  await panel.getByRole('button', { name: 'Keep my plan' }).click()
  const lab = panel.getByTestId('plan-todo').filter({ hasText: 'Lab report write-up' })
  await lab.getByRole('button', { name: 'Pick a time' }).click()
  // No gap fits 4h, so it starts at the first free moment: Monday after the accepted quiz block.
  await expect(lab.getByLabel('Start time for Lab report write-up')).toHaveValue(toLocalInput(at(0, 9, 30)))
  await lab.getByLabel('Start time for Lab report write-up').fill(toLocalInput(at(1, 10)))
  await lab.getByRole('button', { name: 'Add' }).click()
  // 10:00-14:00 on Tuesday runs into the 13:00 commitment: refused, nothing saved.
  await expect(panel.getByText('"Lab report write-up" would overlap Busy 1 there. Pick a free time.')).toBeVisible()
  expect(stored(simulator, 'lab')?.starts_at).toBeNull()

  await lab.getByRole('button', { name: 'Pick a time' }).click()
  await lab.getByLabel('Start time for Lab report write-up').fill(toLocalInput(at(1, 8)))
  await lab.getByRole('button', { name: 'Add' }).click()
  await expect.poll(() => stored(simulator, 'lab')?.starts_at).toBe(iso(1, 8))
})

test('closing and reopening the panel keeps the draft', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)
  await panel.getByRole('button', { name: 'Close Help me plan' }).click()
  await expect(page.getByTestId('proposal-tray')).toBeVisible()
  await page.getByTestId('help-me-plan').click()
  await expect(panel.getByTestId('autofill-trim')).toContainText('Lab report write-up (4h) is too long for one day.')
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

test('the panel floats over the weekend, so Monday to Friday keep their width', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  // The demo board's Calendar is about 900px wide, beside To-do and Coming up.
  await mount(<CalendarHarness width={900} />)
  const days = page.getByTestId('calendar-day')
  const before = await days.nth(0).boundingBox()
  const panel = await openPlan(page)
  await expect(page.getByRole('complementary', { name: 'Plan your time' })).toBeVisible()
  const after = await days.nth(0).boundingBox()
  expect(after!.width).toBeCloseTo(before!.width, 0)
  // It covers the weekend and at most the end of Friday.
  const friday = await days.nth(4).boundingBox()
  const box = await panel.boundingBox()
  expect(box!.x).toBeGreaterThan(friday!.x + friday!.width * 0.6)
  // Hide tucks it away to see what is under it.
  await panel.getByRole('button', { name: 'Hide the plan to see the calendar' }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Show plan' }).click()
  await expect(panel).toBeVisible()
})

test('keyboard: focus moves into the panel, follows Hide, Show plan and Auto-fill, and comes back from Pick a time', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  await page.getByRole('button', { name: 'Next week' }).click()
  await page.getByTestId('help-me-plan').focus()
  await page.keyboard.press('Enter')
  const panel = page.getByTestId('help-me-plan-panel')
  await expect(panel.getByRole('heading', { name: 'Plan your time' })).toBeFocused()

  // Hide hands focus to Show plan, and Show plan back into the panel.
  await panel.getByRole('button', { name: 'Hide the plan to see the calendar' }).press('Enter')
  await expect(page.getByRole('button', { name: 'Show plan' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('heading', { name: 'Plan your time' })).toBeFocused()

  // Auto-fill asks about the missing estimate, then lands on the draft.
  await panel.getByTestId('autofill').press('Enter')
  await expect(panel.getByRole('button', { name: 'Assume 1h and Auto-fill' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('heading', { name: /^Draft · / })).toBeFocused()

  // Escape from Pick a time goes back to the button that opened it.
  const pick = panel.getByRole('button', { name: 'Pick a time for Lab report write-up' })
  await pick.press('Enter')
  await expect(panel.getByLabel('Start time for Lab report write-up')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(pick).toBeFocused()

  // Keep my plan ends the draft: focus goes to Auto-fill, not the page.
  await panel.getByRole('button', { name: 'Keep my plan' }).press('Enter')
  await expect(panel.getByTestId('autofill')).toBeFocused()

  // Closing hands focus back to Help me plan.
  await panel.getByRole('button', { name: 'Close Help me plan' }).press('Enter')
  await expect(page.getByTestId('help-me-plan')).toBeFocused()
})

/** Monday and Tuesday mornings free (2h a day); three 90-minute to-dos, so each day keeps a 30-minute piece. */
function seedFragmentedWeek(simulator: BackendSimulator) {
  seed(simulator, Array.from({ length: 7 }, (_, d) => ({
    id: `busy-${d}`, kind: 'commitment' as const, title: `Busy ${d}`, starts_at: iso(d, d < 2 ? 12 : 8), ends_at: iso(d, 22),
  })))
  seed(simulator, [
    { id: 'essay', title: 'Essay plan', duration_min: 90, course: 'biology' },
    { id: 'sheet', title: 'Problem sheet', duration_min: 90, course: 'chemistry' },
    { id: 'paper', title: 'Past paper', duration_min: 90, course: 'chemistry' },
  ])
}

test('free time left in short gaps is named, and Pick a time never defaults onto a drafted block', async ({ mount, page, simulator }) => {
  seedFragmentedWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await expect(panel.getByTestId('plan-capacity')).toContainText('About 4 hours of study time left next week (2h a day). Your to-dos need 4.5.')
  await panel.getByTestId('autofill').click()
  const draft = panel.getByTestId('autofill-draft')
  // 3h drafted + 1h in two 30-minute pieces = the 4h the headline counts.
  await expect(draft.getByTestId('autofill-summary')).toHaveText(
    "Drafted 3h of study time. 1h 30m didn't fit. The other 1h of free time is in gaps too short for it.",
  )
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(2)

  // The one that didn't fit: Pick a time starts clear of both drafted blocks,
  // so adding it straight away takes nothing out of the draft.
  const unplaced = draft.getByTestId('autofill-unplaced')
  await unplaced.getByRole('button', { name: /^Pick a time for / }).click()
  await unplaced.getByRole('button', { name: 'Add' }).click()
  await expect(unplaced).toHaveCount(0)
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(2)
  await expect(page.getByTestId('calendar-notice')).toHaveCount(0)
  expect(simulator.db.planItems.filter((i) => i.kind === 'task' && i.starts_at)).toHaveLength(1)
})

test('a draft lists its blocks, hatches the shortfall, offers Shrink only and a time for what did not fit', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await draftWithAssumedEstimates(page)

  // 4h of study time left (2h a day), 6h needed: the bar hatches the 2h short.
  await expect(panel.getByTestId('plan-capacity-numbers')).toHaveText(/4h free\s*6h to do\s*2h short/)
  await expect(panel.getByTestId('plan-shortfall')).toBeVisible()

  const draft = panel.getByTestId('autofill-draft')
  await expect(draft.getByRole('heading', { name: 'Draft · 2 blocks' })).toBeVisible()
  await expect(draft.getByTestId('autofill-block')).toHaveText([/Biology quiz prep/, /Flashcards: organelles/])
  await expect(draft.getByTestId('autofill-summary')).toHaveText(
    // Only the lab report (too long for a day) didn't fit: short gaps aren't blamed.
    "Drafted 2h of study time. 4h didn't fit.",
  )
  // Over capacity offers Shrink, never a split.
  await expect(draft.getByRole('button', { name: /^Shrink to/ })).toHaveCount(1)
  await expect(draft.getByRole('button', { name: /split/i })).toHaveCount(0)

  // Drafted blocks are hatched with a dashed edge; free gaps go around them.
  const ghosts = page.getByTestId('calendar-ghost')
  await expect(ghosts.first()).toHaveAttribute('data-look', 'ghost')
  await expect(ghosts.first()).toHaveClass(/hatch-course-biology-soft/)
  await expect(ghosts.first()).toHaveClass(/border-dashed/)
  const free = page.getByTestId('calendar-free')
  await expect(free.filter({ hasText: /^(\d+h)?( ?\d+m)? free$/ }).first()).toBeVisible()
  for (const g of await ghosts.all()) {
    const gb = (await g.boundingBox())!
    for (const f of await free.all()) {
      const fb = await f.boundingBox()
      if (!fb || fb.x + fb.width <= gb.x || gb.x + gb.width <= fb.x) continue
      expect(fb.y + fb.height <= gb.y + 1 || gb.y + gb.height <= fb.y + 1).toBe(true)
    }
  }

  // The lab report didn't fit: Pick a time gives it one straight away.
  const unplaced = draft.getByTestId('autofill-unplaced')
  await unplaced.getByRole('button', { name: 'Pick a time for Lab report write-up' }).click()
  await unplaced.getByLabel('Start time for Lab report write-up').fill(toLocalInput(at(1, 7)))
  await unplaced.getByRole('button', { name: 'Add' }).click()
  await expect.poll(() => stored(simulator, 'lab')?.starts_at).toBe(iso(1, 7))
  await expect(unplaced).toHaveCount(0)

  // Accept draft saves the rest.
  await panel.getByRole('button', { name: 'Accept draft' }).click()
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).not.toBeNull()
  await expect(ghosts).toHaveCount(0)
})

test('with no study time left, a draft says nothing fits and offers no Shrink', async ({ mount, page, simulator }) => {
  seed(simulator, Array.from({ length: 7 }, (_, d) => ({
    id: `busy-${d}`, kind: 'commitment' as const, title: `Busy ${d}`, starts_at: iso(d, 0), ends_at: iso(d, 23, 59),
  })))
  seed(simulator, [{ id: 'lab', title: 'Lab report write-up', duration_min: 240, course: 'chemistry' }])
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await expect(panel.getByTestId('plan-capacity')).toContainText('No study time left next week (2h a day).')
  await panel.getByTestId('autofill').click()
  const draft = panel.getByTestId('autofill-draft')
  await expect(draft.getByTestId('autofill-summary')).toHaveText("Nothing fits as it is. 4h didn't fit.")
  await expect(draft.getByRole('heading', { name: 'Draft', exact: true })).toBeVisible()
  await expect(draft.getByTestId('autofill-block')).toHaveCount(0)
  await expect(draft.getByTestId('autofill-trim')).toHaveCount(0)
})
