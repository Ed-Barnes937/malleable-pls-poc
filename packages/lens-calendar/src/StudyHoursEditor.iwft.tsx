import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { CalendarHarness } from '../../../playwright/calendar-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import type { StoredPlanItem } from '../../../playwright/backend-simulator/in-memory-db'
import { WEEKDAYS, type StudyHours } from '@pls/substrate'
import { startOfWeek } from './time'

// Plans next week, so "now" never eats into the study time being tested.
const monday = startOfWeek(new Date())
const iso = (day: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7 + day, h, m).toISOString()

/** One to-do, so the panel has something to plan. */
function seed(simulator: BackendSimulator) {
  simulator.db.planItems.push({
    id: 'essay', kind: 'task', title: 'Essay plan', starts_at: null, ends_at: null, due_at: null, duration_min: 120,
    status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null,
    source_offset_ms: null, created_at: iso(-7, 0), updated_at: iso(-7, 0),
  } as StoredPlanItem)
}

async function openPlan(page: Page) {
  await page.getByRole('button', { name: 'Next week' }).click()
  await page.getByTestId('help-me-plan').click()
  return page.getByTestId('help-me-plan-panel')
}

const every = (start: string, end: string): StudyHours =>
  Object.fromEntries(WEEKDAYS.map((d) => [d, { start, end }])) as StudyHours

const editor = (page: Page) => page.getByRole('dialog', { name: 'When do you study?' })
const line = (page: Page) => page.getByTestId('study-rhythm')
const change = (page: Page) => page.getByRole('button', { name: 'Change when you study' })

test('one range for every day: the line, the editor, and Save keeps the hours, the zone and the wash', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  // No preference yet: the defaults.
  await expect(line(page)).toHaveText(/^Study 09:00-22:00\W+2h a day\W+Change$/)

  await change(page).click()
  const dialog = editor(page)
  await expect(dialog).toBeVisible()
  // Focus moves in, to the first time.
  await expect(dialog.getByLabel('Start time, every day')).toBeFocused()
  await expect(dialog.getByLabel('End time, every day')).toHaveValue('22:00')
  await expect(dialog.getByLabel('Study time per day')).toHaveValue('120')
  // 24:00 is a valid end.
  await expect(dialog.getByLabel('End time, every day').locator('option', { hasText: '24:00' })).toHaveCount(1)

  await dialog.getByLabel('Start time, every day').selectOption('10:00')
  await dialog.getByLabel('End time, every day').selectOption('21:00')
  await dialog.getByLabel('Study time per day').selectOption('60')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(dialog).toBeHidden()
  await expect(change(page)).toBeFocused()
  await expect(line(page)).toHaveText(/^Study 10:00-21:00\W+1h a day\W+Change$/)
  // Seven days of 1h (10:00-21:00 is never short of an hour).
  await expect(page.getByTestId('plan-capacity')).toContainText('About 7 hours of study time left next week (1h a day).')
  await expect.poll(() => simulator.db.preferences).toEqual({
    study_hours: every('10:00', '21:00'),
    study_min_per_day: 60,
    // Saved with the first study hours: the zone they are read in.
    time_zone: 'Europe/London',
  })

  // While planning, the hours outside study time are washed: before 10:00 and after 21:00 every day.
  await expect(page.getByTestId('calendar-off-hours')).toHaveCount(14)
  const mondayWash = page.getByTestId('calendar-day').first().getByTestId('calendar-off-hours')
  const hourPx = await page.getByTestId('calendar-day').first().evaluate((el) => el.getBoundingClientRect().height / 24)
  expect((await mondayWash.first().boundingBox())!.height).toBeCloseTo(10 * hourPx, 0)
  expect((await mondayWash.last().boundingBox())!.height).toBeCloseTo(3 * hourPx, 0)
  await page.getByRole('button', { name: 'Close Help me plan' }).click()
  await expect(page.getByTestId('calendar-off-hours')).toHaveCount(0)
})

test('different on some days: a range per day, No study on Sunday, and the line sums it up', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await change(page).click()
  const dialog = editor(page)
  await dialog.getByLabel('Start time, every day').selectOption('10:00')

  const different = dialog.getByRole('button', { name: 'Different on some days' })
  await expect(different).toHaveAttribute('aria-expanded', 'false')
  await different.click()
  await expect(different).toHaveAttribute('aria-expanded', 'true')
  // Each day starts from what "Every day" said.
  for (const day of ['Monday', 'Saturday', 'Sunday']) {
    await expect(dialog.getByLabel(`Start time, ${day}`)).toHaveValue('10:00')
    await expect(dialog.getByLabel(`End time, ${day}`)).toHaveValue('22:00')
  }
  await dialog.getByRole('checkbox', { name: 'No study on Sunday' }).check()
  await expect(dialog.getByLabel('Start time, Sunday')).toBeDisabled()
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect(line(page)).toHaveText(/^Study 10:00-22:00, no study Sun\W+2h a day\W+Change$/)
  await expect.poll(() => simulator.db.preferences?.study_hours).toEqual({ ...every('10:00', '22:00'), sun: null })
  // Six study days x 2h.
  await expect(page.getByTestId('plan-capacity')).toContainText('About 12 hours of study time left next week (2h a day).')
  // Sunday is washed from midnight to midnight.
  const sunday = page.getByTestId('calendar-day').nth(6)
  const wash = sunday.getByTestId('calendar-off-hours')
  await expect(wash).toHaveCount(1)
  expect((await wash.boundingBox())!.height).toBeCloseTo((await sunday.boundingBox())!.height, 0)

  // Saturday from 11:00 too: the days now differ.
  await change(page).click()
  await expect(different).toHaveAttribute('aria-expanded', 'true')
  await expect(dialog.getByRole('checkbox', { name: 'No study on Sunday' })).toBeChecked()
  await dialog.getByLabel('Start time, Saturday').selectOption('11:00')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(line(page)).toHaveText(/^Study hours vary by day\W+2h a day\W+Change$/)
  await expect.poll(() => simulator.db.preferences?.study_hours?.sat).toEqual({ start: '11:00', end: '22:00' })
})

test('collapsing "Different on some days" says Save will replace the different days, and then it does', async ({ mount, page, simulator }) => {
  seed(simulator)
  simulator.db.preferences = { time_zone: 'Europe/London', study_hours: { ...every('09:00', '22:00'), sun: null }, study_min_per_day: 120 }
  await mount(<CalendarHarness />)
  await openPlan(page)
  await change(page).click()
  const dialog = editor(page)
  const different = dialog.getByRole('button', { name: 'Different on some days' })
  // The days differ, so it opens on them: nothing to warn about.
  await expect(different).toHaveAttribute('aria-expanded', 'true')
  await expect(dialog.getByTestId('study-hours-note')).toHaveCount(0)

  await different.click()
  const note = dialog.getByTestId('study-hours-note')
  await expect(note).toHaveText('Saving uses these times for every day, replacing the times you set for each day.')
  await expect(dialog.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription('Saving uses these times for every day, replacing the times you set for each day.')
  // Only the study time per day changed, but Save gives every day the same times, as it said.
  await dialog.getByLabel('Study time per day').selectOption('180')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => simulator.db.preferences).toEqual({ time_zone: 'Europe/London', study_hours: every('09:00', '22:00'), study_min_per_day: 180 })
  await expect(line(page)).toHaveText(/^Study 09:00-22:00\W+3h a day\W+Change$/)
})

test('no note when the days are already the same, even after opening and closing the days', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await change(page).click()
  const dialog = editor(page)
  await expect(dialog.getByTestId('study-hours-note')).toHaveCount(0)
  const different = dialog.getByRole('button', { name: 'Different on some days' })
  await different.click()
  await different.click()
  await expect(dialog.getByTestId('study-hours-note')).toHaveCount(0)
  // A day changed and then closed again would be lost: that is said.
  await different.click()
  await dialog.getByRole('checkbox', { name: 'No study on Sunday' }).check()
  await different.click()
  await expect(dialog.getByTestId('study-hours-note')).toBeVisible()
})

test('closing and opening the days again keeps the edits made in them', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await change(page).click()
  const dialog = editor(page)
  const different = dialog.getByRole('button', { name: 'Different on some days' })
  await different.click()
  await dialog.getByLabel('Start time, Monday').selectOption('11:00')
  await dialog.getByRole('checkbox', { name: 'No study on Sunday' }).check()
  await different.click()
  await different.click()
  await expect(dialog.getByLabel('Start time, Monday')).toHaveValue('11:00')
  await expect(dialog.getByRole('checkbox', { name: 'No study on Sunday' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => simulator.db.preferences?.study_hours).toEqual({ ...every('09:00', '22:00'), mon: { start: '11:00', end: '22:00' }, sun: null })
})

test('days edited to the same times, but not the "Every day" ones, get the note too', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await change(page).click()
  const dialog = editor(page)
  const different = dialog.getByRole('button', { name: 'Different on some days' })
  await different.click()
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await dialog.getByLabel(`Start time, ${day}`).selectOption('10:00')
  }
  await different.click()
  // "Every day" still says 09:00: Save would put that back on every day, so it says so.
  await expect(dialog.getByLabel('Start time, every day')).toHaveValue('09:00')
  await expect(dialog.getByTestId('study-hours-note')).toBeVisible()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  // Every day 09:00-22:00 is what was there: nothing to save.
  expect(simulator.db.preferences).toBeNull()
})

test('study hours saved while Auto-fill is drafting shape the draft it lands', async ({ mount, page, simulator }) => {
  seed(simulator)
  for (let i = 1; i <= 6; i++) {
    simulator.db.planItems.push({ ...simulator.db.planItems[0], id: `paper-${i}`, title: `Past paper ${i}` })
  }
  await mount(<CalendarHarness />)
  await openPlan(page)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/planning.autofill**', async (route) => {
    await held
    await route.fallback()
  })
  await page.getByTestId('autofill').click()
  await expect(page.getByTestId('autofill')).toHaveText('Drafting your week...')

  await change(page).click()
  const dialog = editor(page)
  await dialog.getByLabel('Start time, every day').selectOption('10:00')
  await dialog.getByRole('button', { name: 'Different on some days' }).click()
  await dialog.getByRole('checkbox', { name: 'No study on Sunday' }).check()
  await dialog.getByRole('button', { name: 'Save' }).click()
  release()

  // Seven 2h to-dos, six study days from 10:00: no block on Sunday, none before 10:00.
  const ghosts = page.getByTestId('calendar-ghost')
  await expect(ghosts).toHaveCount(6)
  for (const ghost of await ghosts.all()) await expect(ghost).toHaveAttribute('aria-label', /, 10:00 - 12:00$/)
})

test('if the preference cannot load, saving study hours does not set a time zone', async ({ mount, page, simulator }) => {
  seed(simulator)
  await page.route('**/preferences.get**', (route) => route.fulfill({ status: 500, body: '{}' }))
  const sent: Record<string, unknown>[] = []
  await page.route('**/preferences.update**', async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? 'null'))
    await route.fallback()
  })
  await mount(<CalendarHarness />)
  await openPlan(page)
  // The defaults apply.
  await expect(line(page)).toHaveText(/^Study 09:00-22:00\W+2h a day\W+Change$/)
  await change(page).click()
  await editor(page).getByLabel('Start time, every day').selectOption('10:00')
  await editor(page).getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => simulator.db.preferences?.study_hours).toEqual(every('10:00', '22:00'))
  expect(sent).toHaveLength(1)
  expect(JSON.stringify(sent[0])).not.toContain('time_zone')
  expect(simulator.db.preferences?.time_zone).toBeNull()
})

/** The tab is shown again (what TanStack's focus manager listens for). */
const refocus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))

test('coming back to the tab re-reads the preference, but not while a change is being saved', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await expect(line(page)).toContainText('2h a day')
  const gets: string[] = []
  page.on('request', (r) => { if (r.url().includes('preferences.get')) gets.push(r.url()) })

  // Nothing saving: changed elsewhere (another tab), it shows on coming back.
  simulator.db.preferences = { time_zone: null, study_hours: null, study_min_per_day: 90 }
  await refocus(page)
  await expect(line(page)).toContainText('1h 30m a day')
  expect(gets.length).toBeGreaterThan(0)

  // A save waiting: coming back does not re-read, so the change shown stays.
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/preferences.update**', async (route) => {
    await held
    await route.fallback()
  })
  await change(page).click()
  await editor(page).getByLabel('Study time per day').selectOption('60')
  await editor(page).getByRole('button', { name: 'Save' }).click()
  await expect(line(page)).toContainText('1h a day')
  const before = gets.length
  await refocus(page)
  await page.waitForTimeout(300)
  expect(gets.length).toBe(before)
  await expect(line(page)).toContainText('1h a day')

  release()
  // Read back once the save is done.
  await expect.poll(() => gets.length).toBe(before + 1)
  await expect(line(page)).toContainText('1h a day')
})

test('an end before the start is refused with a clear message, and nothing is saved', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await change(page).click()
  const dialog = editor(page)
  const end = dialog.getByLabel('End time, every day')
  await end.selectOption('08:00')
  await expect(dialog.getByText('End time must be after the start time.')).toBeVisible()
  await expect(end).toHaveAttribute('aria-invalid', 'true')
  await expect(end).toHaveAccessibleDescription('End time must be after the start time.')
  // The same time is not after it either.
  await end.selectOption('09:00')
  await expect(dialog.getByText('End time must be after the start time.')).toBeVisible()

  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeVisible()
  await expect(end).toBeFocused()
  expect(simulator.db.preferences).toBeNull()

  // Fixed, the message goes.
  await end.selectOption('22:00')
  await expect(dialog.getByTestId('study-hours-error')).toHaveCount(0)

  // Per day too.
  await dialog.getByRole('button', { name: 'Different on some days' }).click()
  await dialog.getByLabel('End time, Wednesday').selectOption('07:00')
  await expect(dialog.getByTestId('study-hours-error')).toHaveCount(1)
  await expect(dialog.getByLabel('End time, Wednesday')).toHaveAttribute('aria-invalid', 'true')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByLabel('End time, Wednesday')).toBeFocused()
  expect(simulator.db.preferences).toBeNull()
  // A "No study" day is never wrong.
  await dialog.getByRole('checkbox', { name: 'No study on Wednesday' }).check()
  await expect(dialog.getByTestId('study-hours-error')).toHaveCount(0)
})

test('Cancel, Escape and a press outside close it with nothing saved; focus goes back to Change', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  const dialog = editor(page)

  await change(page).click()
  await dialog.getByLabel('Start time, every day').selectOption('11:00')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(change(page)).toBeFocused()

  await change(page).press('Enter')
  // Opens fresh, not with the cancelled change.
  await expect(dialog.getByLabel('Start time, every day')).toHaveValue('09:00')
  await dialog.getByLabel('Start time, every day').selectOption('11:00')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(change(page)).toBeFocused()
  // Escape closed only the editor, not the panel.
  await expect(page.getByTestId('help-me-plan-panel')).toBeVisible()

  await change(page).click()
  await page.getByTestId('plan-capacity').click()
  await expect(dialog).toBeHidden()

  await expect(line(page)).toHaveText(/^Study 09:00-22:00\W+2h a day\W+Change$/)
  expect(simulator.db.preferences).toBeNull()
})

test('Tab stays inside the editor while it is open', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await change(page).click()
  const dialog = editor(page)
  await expect(dialog.getByLabel('Start time, every day')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByLabel('Start time, every day')).toBeFocused()
})

test('a change shows straight away while it saves, and two quick saves land in order', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  const sent: unknown[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  // Registered after the simulator's route, so it wins for updates only: the first save waits.
  await page.route('**/preferences.update**', async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? 'null'))
    if (sent.length === 1) await held
    await route.fallback()
  })

  const save = async (perDay: string) => {
    await change(page).click()
    await editor(page).getByLabel('Study time per day').selectOption(perDay)
    await editor(page).getByRole('button', { name: 'Save' }).click()
  }
  await save('60')
  // Shown before the server has it.
  await expect(line(page)).toContainText('1h a day')
  await expect(page.getByTestId('plan-capacity')).toContainText('(1h a day)')
  await save('180')
  await expect(line(page)).toContainText('3h a day')
  // The second waits for the first.
  expect(sent).toHaveLength(1)

  release()
  await expect.poll(() => sent.length).toBe(2)
  await expect.poll(() => simulator.db.preferences?.study_min_per_day).toBe(180)
  // Never back to 1h or 2h once both are saved and read back.
  await expect(line(page)).toContainText('3h a day')
  await expect(page.getByTestId('plan-capacity')).toContainText('(3h a day)')
})

test('a save that fails goes back to what is saved, and says so', async ({ mount, page, simulator }) => {
  seed(simulator)
  await mount(<CalendarHarness />)
  await openPlan(page)
  await page.route('**/preferences.update**', (route) => route.fulfill({ status: 500, body: '{}' }))
  await change(page).click()
  await editor(page).getByLabel('Start time, every day').selectOption('10:00')
  await editor(page).getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText("Couldn't save your study hours. Try again?")).toBeVisible()
  await expect(line(page)).toHaveText(/^Study 09:00-22:00\W+2h a day\W+Change$/)
})

/** The whole editor on screen, every field and button reachable, each day's row on one line. */
async function expectFits(page: Page, viewport: { width: number; height: number }) {
  const dialog = editor(page)
  const different = dialog.getByRole('button', { name: 'Different on some days' })
  if ((await different.getAttribute('aria-expanded')) !== 'true') await different.click()
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  for (const day of ['Monday', 'Sunday']) {
    const start = (await dialog.getByLabel(`Start time, ${day}`).boundingBox())!
    const off = (await dialog.getByRole('checkbox', { name: `No study on ${day}` }).boundingBox())!
    expect(Math.abs(start.y + start.height / 2 - (off.y + off.height / 2)), day).toBeLessThan(4)
    expect(off.x + off.width).toBeLessThanOrEqual(box.x + box.width)
  }
  await dialog.getByRole('button', { name: 'Save' }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport()
}

test('beside the narrow panel (about 236px over the weekend), the editor fits on screen', async ({ mount, page, simulator }) => {
  // The demo board's Calendar at 1440x900 on a Tuesday: the panel floats over the weekend.
  seed(simulator)
  simulator.db.preferences = { time_zone: 'Europe/London', study_hours: { ...every('09:00', '22:00'), sun: null }, study_min_per_day: 120 }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.setFixedTime(new Date('2026-10-27T10:30:00Z'))
  await mount(<CalendarHarness width={882} height={712} />)
  await page.getByTestId('help-me-plan').click()
  expect((await page.getByTestId('help-me-plan-panel').boundingBox())!.width).toBeLessThan(260)
  // The line wraps between phrases, never inside "no study Sun".
  await expect(line(page)).toContainText('Study 09:00-22:00, no study Sun')
  const dayPhrase = line(page).getByText('no study Sun', { exact: true })
  const lineHeight = await dayPhrase.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  expect((await dayPhrase.boundingBox())!.height).toBeLessThan(lineHeight * 1.5)
  await change(page).click()
  await expectFits(page, { width: 1440, height: 900 })
})

test('on a phone (400px), the editor fits on screen', async ({ mount, page, simulator }) => {
  seed(simulator)
  await page.setViewportSize({ width: 400, height: 760 })
  await mount(<CalendarHarness width="100%" height={720} />)
  await page.getByRole('tab', { name: 'Week' }).click()
  await openPlan(page)
  await change(page).click()
  await expectFits(page, { width: 400, height: 760 })
})
