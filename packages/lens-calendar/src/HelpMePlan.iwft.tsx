import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { CalendarHarness } from '../../../playwright/calendar-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import type { StoredPlanItem } from '../../../playwright/backend-simulator/in-memory-db'
import { startOfWeek } from './time'
import { priyaWeek } from '../../../e2e/seed-week'

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

/** Sets study time per day in the study hours editor (Change, then Save). */
async function setStudyTimePerDay(page: Page, minutes: string) {
  await page.getByRole('button', { name: 'Change when you study' }).click()
  const editor = page.getByRole('dialog', { name: 'When do you study?' })
  await editor.getByLabel('Study time per day').selectOption(minutes)
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(editor).toBeHidden()
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

  // The study-time setting changes the numbers, and is saved as the student's preference.
  await setStudyTimePerDay(page, '60')
  await expect(panel.getByTestId('plan-capacity')).toContainText('About 2 hours of study time left next week (1h a day).')
  await expect.poll(() => simulator.db.preferences?.study_min_per_day).toBe(60)
})

test("reads study time per day and study hours from the student's preference", async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  const every = { start: '09:00', end: '22:00' }
  // No study on Tuesday; 90 minutes a day.
  simulator.db.preferences = {
    time_zone: null,
    study_hours: { mon: every, tue: null, wed: every, thu: every, fri: every, sat: every, sun: every },
    study_min_per_day: 90,
  }
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await expect(panel.getByTestId('plan-capacity')).toContainText('About 1.5 hours of study time left next week (1h 30m a day).')
  await expect(panel.getByTestId('study-rhythm')).toHaveText(/^Study 09:00-22:00, no study Tue\W+1h 30m a day\W+Change$/)
  await panel.getByRole('button', { name: 'Change when you study' }).click()
  const editor = page.getByRole('dialog', { name: 'When do you study?' })
  await expect(editor.getByLabel('Study time per day')).toHaveValue('90')
  await expect(editor.getByRole('checkbox', { name: 'No study on Tuesday' })).toBeChecked()
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

test('a drafted 20-minute block is drawn to scale, and its accept button shows on hover', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  simulator.db.planItems = simulator.db.planItems.filter((p) => p.kind !== 'task')
  seed(simulator, [
    { id: 'short', title: 'Short review', duration_min: 20, course: 'biology' },
    { id: 'hour', title: 'Hour of reading', duration_min: 60, course: 'biology' },
  ])
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await panel.getByTestId('autofill').click()
  const short = ghost(page, 'Short review')
  await expect(short).toBeVisible()
  const hourPx = (await ghost(page, 'Hour of reading').boundingBox())!.height + 2
  expect((await short.boundingBox())!.height).toBeCloseTo(hourPx / 3 - 2, 0)
  await short.hover()
  await page.getByRole('button', { name: 'Accept Short review' }).click()
  await expect.poll(() => stored(simulator, 'short')?.duration_min).toBe(20)
  await expect.poll(() => stored(simulator, 'short')?.starts_at).not.toBeNull()
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true })

  test("tapping a short drafted block shows its buttons without accepting it; tapping Accept accepts", async ({ mount, page, simulator }) => {
    seedBusyWeek(simulator)
    simulator.db.planItems = simulator.db.planItems.filter((p) => p.kind !== 'task')
    seed(simulator, [{ id: 'short', title: 'Short review', duration_min: 20, course: 'biology' }])
    await mount(<CalendarHarness />)
    const panel = await openPlan(page)
    await panel.getByTestId('autofill').click()
    const short = ghost(page, 'Short review')
    await expect(short).toBeVisible()
    const accept = page.getByRole('button', { name: 'Accept Short review' })
    const shown = () => accept.evaluate((el) => getComputedStyle(el.parentElement!).opacity)
    expect(await shown()).toBe('0')

    await short.tap()
    await expect(short).toBeFocused()
    await expect.poll(shown).toBe('1')
    expect(stored(simulator, 'short')?.starts_at).toBeNull()

    await accept.tap()
    await expect.poll(() => stored(simulator, 'short')?.starts_at).not.toBeNull()
  })
})

/** Holds every request to `procedure` (alone or in a batch) until `release()`; the simulator answers it then. */
async function hold(page: Page, procedure: string) {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route((url) => url.pathname.split(/[/,]/).includes(procedure), async (route) => {
    await held
    await route.fallback()
  })
  return release
}

test('Auto-fill straight after picking a slot drafts around the block still saving, and keeps every draft', async ({ mount, page, simulator }) => {
  seedBusyWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  const release = await hold(page, 'planItems.update')
  // Monday 09:00-10:00, saving slowly.
  await panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' }).getByTestId('plan-suggestion').first().click()
  await expect(page.getByTestId('calendar-block').filter({ hasText: 'Biology quiz prep' })).toBeVisible()
  await expect(panel.getByTestId('plan-todo').filter({ hasText: 'Biology quiz prep' })).toHaveCount(0)

  await panel.getByTestId('autofill').click()
  await panel.getByRole('button', { name: 'Assume 1h and Auto-fill' }).click()
  const ghosts = page.getByTestId('calendar-ghost')
  await expect(ghosts.first()).toBeVisible()
  // Nothing drafted for the quiz again, nor over its block.
  await expect(ghosts.filter({ hasText: 'Biology quiz prep' })).toHaveCount(0)
  await expect(ghost(page, 'Flashcards')).not.toHaveAttribute('aria-label', /09:00 - 10:00/)
  const drafted = await ghosts.count()

  release()
  await expect.poll(() => stored(simulator, 'quiz')?.starts_at).toBe(iso(0, 9))
  await expect(page.getByTestId('calendar-block').filter({ hasText: 'Biology quiz prep' })).toBeVisible()
  // The draft holds: no ghost is taken out when the saved block arrives.
  await expect(page.getByText(/out of the suggestions/)).toHaveCount(0)
  await expect(ghosts).toHaveCount(drafted)
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
  await setStudyTimePerDay(page, '60')
  await expect(draft.getByTestId('autofill-trim')).toHaveText([/Lab report write-up \(4h\) is too long for one day\.\s*Shrink to 1h/])
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(2)
  await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 2h of study time. 4h didn't fit.")

  await draft.getByRole('button', { name: 'Shrink to 1h' }).click()
  // Both open days already have their 1h: the study time, not a gap, is what's short.
  await expect(draft.getByTestId('autofill-unplaced')).toContainText("Flashcards: organelles (1h) didn't fit: too little study time left on any day.")
  await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 2h of study time. 1h didn't fit.")

  // 3h a day: the offer is the new day length, not the 2h the advice said.
  await draft.getByRole('button', { name: 'Undo' }).click()
  await setStudyTimePerDay(page, '180')
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

test.describe('where the panel floats, by day of the week (frozen clock)', () => {
  // The week of Mon 2 Nov 2026 (GMT, no clock change), busy 13:00-22:00 every
  // day: each morning has 2h of study time.
  const day = (d: number, h: number, m = 0) => new Date(2026, 10, 2 + d, h, m)
  const MON = 0, TUE = 1, WED = 2, FRI = 4

  async function planAt(page: Page, simulator: BackendSimulator, now: Date, todos: number) {
    seed(simulator, Array.from({ length: 7 }, (_, d) => ({
      id: `busy-${d}`, kind: 'commitment' as const, title: `Busy ${d}`, starts_at: day(d, 13).toISOString(), ends_at: day(d, 22).toISOString(),
    })))
    seed(simulator, Array.from({ length: todos }, (_, i) => ({ id: `todo-${i}`, title: `Essay part ${i + 1}`, duration_min: 120, course: 'biology' })))
    await page.clock.setFixedTime(now)
  }

  async function autofill(page: Page) {
    await page.getByTestId('help-me-plan').click()
    const panel = page.getByTestId('help-me-plan-panel')
    await panel.getByTestId('autofill').click()
    await expect(panel.getByTestId('autofill-draft')).toBeVisible()
    await expect(page.getByTestId('calendar-ghost').first()).toBeVisible()
    return panel
  }

  /** No drafted block is under the panel, even partly. */
  async function expectNoGhostUnder(page: Page, panel: ReturnType<Page['getByTestId']>) {
    const box = (await panel.boundingBox())!
    const ghosts = page.getByTestId('calendar-ghost')
    expect(await ghosts.count()).toBeGreaterThan(0)
    for (const g of await ghosts.all()) {
      const b = (await g.boundingBox())!
      const overlaps = b.x < box.x + box.width && box.x < b.x + b.width && b.y < box.y + box.height && box.y < b.y + b.height
      expect(overlaps, `${await g.getAttribute('aria-label')} is under the panel`).toBe(false)
    }
  }

  for (const [name, weekday, hour] of [['Wednesday', WED, 12], ['Friday', FRI, 10]] as const) {
    test(`on a ${name}, it covers the days already past and none of today`, async ({ mount, page, simulator }) => {
      await planAt(page, simulator, day(weekday, hour), 4)
      // The demo board's Calendar is about 900px wide, beside To-do and Coming up.
      await mount(<CalendarHarness width={900} />)
      const days = page.getByTestId('calendar-day')
      const before = await days.nth(weekday).boundingBox()
      const panel = await autofill(page)
      await expect(page.getByTestId('help-me-plan-panel').locator('..')).toHaveAttribute('data-placement', 'left')
      const box = (await panel.boundingBox())!
      const today = (await days.nth(weekday).boundingBox())!
      const grid = (await page.getByTestId('calendar').boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(grid.x)
      expect(box.x + box.width).toBeLessThanOrEqual(today.x + 1)
      expect(box.width).toBeGreaterThanOrEqual(256)
      // The days being planned keep their width.
      expect(today.width).toBeCloseTo(before!.width, 0)
      await expectNoGhostUnder(page, panel)
    })
  }

  for (const [name, weekday] of [['Monday', MON], ['Tuesday', TUE]] as const) {
    test(`on a ${name}, with too few days past, it floats over the weekend`, async ({ mount, page, simulator }) => {
      // Two to-dos: drafted on the next two mornings, clear of the weekend.
      await planAt(page, simulator, day(weekday, 9), 2)
      await mount(<CalendarHarness width={900} />)
      const panel = await autofill(page)
      await expect(panel.locator('..')).toHaveAttribute('data-placement', 'right')
      // Exactly over the weekend: all of Friday stays in view.
      const friday = (await page.getByTestId('calendar-day').nth(FRI).boundingBox())!
      expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(friday.x + friday.width - 1)
      await expectNoGhostUnder(page, panel)
    })
  }

  test("the demo on a Thursday: study time held back by the 2h a day isn't blamed on short gaps", async ({ mount, page, simulator }) => {
    const now = new Date('2026-10-29T10:00:00Z')
    for (const { id, ...row } of priyaWeek(now.getTime())) seed(simulator, [{ id, ...row } as Partial<StoredPlanItem> & { id: string }])
    await page.clock.setFixedTime(now)
    await mount(<CalendarHarness width={882} />)
    await page.getByTestId('help-me-plan').click()
    const panel = page.getByTestId('help-me-plan-panel')
    await panel.getByTestId('autofill').click()
    await panel.getByRole('button', { name: 'Shrink to 2h' }).click()
    // Saturday has a long free stretch but only 1h of its 2h left: no to-do left fits in 1h.
    await expect(panel.getByTestId('autofill-summary')).toHaveText(
      "Drafted 7h of study time. 4h didn't fit. The other 1h is on days with too little study time left for them.",
    )
  })

  test('the demo on a Tuesday: drafts Wed-Fri, the panel fits the weekend and no day is squeezed', async ({ mount, page, simulator }) => {
    // Priya's week (pnpm db:reseed), at the journey-demo's default time.
    const now = new Date('2026-10-27T10:30:00Z')
    for (const { id, ...row } of priyaWeek(now.getTime())) seed(simulator, [{ id, ...row } as Partial<StoredPlanItem> & { id: string }])
    await page.clock.setFixedTime(now)
    // As on the demo board at 1440x900: an 858px grid area, so the weekend is only about 236px.
    await mount(<CalendarHarness width={882} />)
    const days = page.getByTestId('calendar-day')
    await expect(days).toHaveCount(7)
    const before = (await days.nth(FRI).boundingBox())!
    await page.getByTestId('help-me-plan').click()
    const panel = page.getByTestId('help-me-plan-panel')
    // Step 2: the quiz revision by hand (today), then Auto-fill and Shrink.
    await panel.getByTestId('plan-todo').filter({ hasText: 'Revise for the Biology quiz' }).getByTestId('plan-suggestion').first().click()
    await expect(page.getByTestId('calendar-block').filter({ hasText: 'Revise for the Biology quiz' })).toBeVisible()
    await panel.getByTestId('autofill').click()
    await panel.getByRole('button', { name: 'Shrink to 2h' }).click()
    await expect(page.getByTestId('calendar-ghost').first()).toBeVisible()
    const draftDays = await page.getByTestId('calendar-ghost').evaluateAll((els) =>
      els.map((el) => el.closest('[data-testid="calendar-day"]')?.getAttribute('data-date')))
    // Wednesday to Friday, Friday's included.
    expect(draftDays.every((d) => [3, 4, 5].includes(new Date(d!).getDay()))).toBe(true)
    expect(draftDays.some((d) => new Date(d!).getDay() === 5)).toBe(true)
    await expect(panel.locator('..')).toHaveAttribute('data-placement', 'right')
    const friday = (await days.nth(FRI).boundingBox())!
    expect(friday.width).toBeCloseTo(before.width, 0)
    expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(friday.x + friday.width - 1)
    expect((await panel.boundingBox())!.width).toBeGreaterThanOrEqual(220)
    await expectNoGhostUnder(page, panel)
  })

  test('early in the week, a draft on the weekend is never hidden: the panel docks beside the grid', async ({ mount, page, simulator }) => {
    // Seven 2h to-dos from Monday 09:00: one a day, Sunday's included.
    await planAt(page, simulator, day(MON, 9), 7)
    await mount(<CalendarHarness width={900} />)
    const panel = await autofill(page)
    await expect(page.getByTestId('calendar-ghost')).toHaveCount(7)
    await expect(panel.locator('..')).toHaveAttribute('data-placement', 'docked')
    const sunday = (await page.getByTestId('calendar-day').nth(6).boundingBox())!
    expect(sunday.x + sunday.width).toBeLessThanOrEqual((await panel.boundingBox())!.x)
    await expectNoGhostUnder(page, panel)
  })
})

test('a week ahead, the panel floats over the weekend, so Monday to Friday keep their width', async ({ mount, page, simulator }) => {
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

/**
 * Every day: classes 10:30-12:00 and 13:30-22:00, so the free time is two
 * short gaps (09:00-10:20 and 12:10-13:20) with the whole 2h of study time
 * to spare: a 90-minute to-do fits nowhere because of the gaps, not the budget.
 */
function seedShortGapWeek(simulator: BackendSimulator, todos: { id: string; durationMin: number }[]) {
  seed(simulator, Array.from({ length: 7 }, (_, d) => [
    { id: `am-${d}`, kind: 'commitment' as const, title: `Morning class ${d}`, starts_at: iso(d, 10, 30), ends_at: iso(d, 12) },
    { id: `pm-${d}`, kind: 'commitment' as const, title: `Afternoon class ${d}`, starts_at: iso(d, 13, 30), ends_at: iso(d, 22) },
  ]).flat())
  seed(simulator, todos.map((t) => ({ id: t.id, title: t.id, duration_min: t.durationMin, course: 'biology' })))
}

test('free time in gaps shorter than the to-dos, with study time to spare, is blamed on the gaps', async ({ mount, page, simulator }) => {
  seedShortGapWeek(simulator, [{ id: 'Essay draft', durationMin: 90 }, { id: 'Past paper', durationMin: 90 }])
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await panel.getByTestId('autofill').click()
  // 2h a day for 7 days, all of it in 80- and 70-minute gaps.
  await expect(panel.getByTestId('autofill-summary')).toHaveText(
    "Nothing fits as it is. 3h didn't fit. The 14h of free time is in gaps too short for them.",
  )
  // Each to-do's own line agrees.
  await expect(panel.getByTestId('autofill-unplaced')).toContainText("Essay draft (1h 30m) didn't fit: no free gap long enough.")
  await expect(panel.getByTestId('autofill-unplaced')).toContainText("Past paper (1h 30m) didn't fit: no free gap long enough.")
})

test('short gaps and a day with too little study time left are each named for what they are', async ({ mount, page, simulator }) => {
  // A 1h to-do takes Monday 09:00-10:00: Monday has 1h of its 2h left, the other days short gaps.
  seedShortGapWeek(simulator, [{ id: 'Reading', durationMin: 60 }, { id: 'Essay draft', durationMin: 90 }, { id: 'Past paper', durationMin: 90 }])
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await panel.getByTestId('autofill').click()
  await expect(ghost(page, 'Reading')).toHaveAttribute('aria-label', /09:00 - 10:00/)
  await expect(panel.getByTestId('autofill-summary')).toHaveText(
    "Drafted 1h of study time. 3h didn't fit. The other 12h of free time is in gaps too short for them, and 1h is on days with too little study time left for them.",
  )
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

test('study time the draft leaves is named for why, and Pick a time never defaults onto a drafted block', async ({ mount, page, simulator }) => {
  seedFragmentedWeek(simulator)
  await mount(<CalendarHarness />)
  const panel = await openPlan(page)
  await expect(panel.getByTestId('plan-capacity')).toContainText('About 4 hours of study time left next week (2h a day). Your to-dos need 4.5.')
  await panel.getByTestId('autofill').click()
  const draft = panel.getByTestId('autofill-draft')
  // 3h drafted + 1h in two 30-minute pieces = the 4h the headline counts. Each day has only
  // 30 minutes of its 2h left, less than a 90-minute to-do (its gaps are short too: the budget binds).
  await expect(draft.getByTestId('autofill-summary')).toHaveText(
    "Drafted 3h of study time. 1h 30m didn't fit. The other 1h is on days with too little study time left for it.",
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
  // The to-do leaves the list as soon as it is picked (its block shows while it saves); wait for the save.
  await expect.poll(() => simulator.db.planItems.filter((i) => i.kind === 'task' && i.starts_at)).toHaveLength(1)
  await expect(page.getByTestId('calendar-ghost')).toHaveCount(2)
  await expect(page.getByTestId('calendar-notice')).toHaveCount(0)
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

test('the demo on a Tuesday: over the weekend the narrow panel keeps its heading, numbers, draft and buttons in view', async ({ mount, page, simulator }) => {
  // Priya's week at the journey-demo's default time, on the demo board's
  // Calendar at 1440x900 (an 858px grid area: the weekend is about 236px).
  const now = new Date('2026-10-27T10:30:00Z')
  for (const { id, ...row } of priyaWeek(now.getTime())) seed(simulator, [{ id, ...row } as Partial<StoredPlanItem> & { id: string }])
  await page.clock.setFixedTime(now)
  await mount(<CalendarHarness width={882} height={712} />)
  await page.getByTestId('help-me-plan').click()
  const panel = page.getByTestId('help-me-plan-panel')
  await panel.getByTestId('plan-todo').filter({ hasText: 'Revise for the Biology quiz' }).getByTestId('plan-suggestion').first().click()
  await expect(page.getByTestId('calendar-block').filter({ hasText: 'Revise for the Biology quiz' })).toBeVisible()
  await panel.getByTestId('autofill').click()
  await panel.getByRole('button', { name: 'Shrink to 2h' }).click()
  await expect(panel.getByTestId('autofill-block')).toHaveCount(3)

  const box = (await panel.boundingBox())!
  expect(box.width).toBeLessThan(260)
  const inside = async (name: string, el: ReturnType<typeof panel.getByTestId>) => {
    const b = (await el.boundingBox())!
    expect(b.y, `${name} top`).toBeGreaterThanOrEqual(box.y)
    expect(b.y + b.height, `${name} bottom`).toBeLessThanOrEqual(box.y + box.height)
    return b
  }
  // "Plan your time" on one line.
  const heading = (await panel.getByRole('heading', { name: 'Plan your time' }).boundingBox())!
  expect(heading.height).toBeLessThan(30)
  // The capacity line stays put above the scrolling draft.
  await expect(panel.getByTestId('plan-capacity')).toContainText('About 7 hours of study time left this week (2h a day). Your to-dos need 10.')
  await inside('capacity', panel.getByTestId('plan-capacity'))
  // Every drafted block shows without scrolling the panel, above its buttons.
  const accept = await inside('Accept draft', panel.getByRole('button', { name: 'Accept draft' }))
  for (const row of await panel.getByTestId('autofill-block').all()) {
    const b = (await row.boundingBox())!
    expect(b.y).toBeGreaterThanOrEqual(box.y)
    expect(b.y + b.height, await row.textContent() ?? '').toBeLessThanOrEqual(accept.y)
  }
  // Accept draft and Keep my plan side by side.
  const keep = await inside('Keep my plan', panel.getByRole('button', { name: 'Keep my plan' }))
  expect(Math.abs(keep.y + keep.height / 2 - (accept.y + accept.height / 2))).toBeLessThan(2)
})
