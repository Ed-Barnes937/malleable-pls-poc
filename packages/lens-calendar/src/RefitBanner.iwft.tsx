import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { CalendarHarness } from '../../../playwright/calendar-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import { daysFromNow, seedPlanItem } from '../../../playwright/plan-items'

// Re-fitting study blocks that didn't happen, from the Calendar: the calm
// question, the new times as ghosts, one atomic accept, or "Keep my plan".

function seedMissed(simulator: BackendSimulator) {
  seedPlanItem(simulator, { id: 'missed-1', kind: 'task', title: 'Read chapter 5', duration_min: 30, starts_at: daysFromNow(-2, 10), ends_at: daysFromNow(-2, 11), course: 'biology' })
  seedPlanItem(simulator, { id: 'missed-2', kind: 'task', title: 'Lab write-up', duration_min: 60, starts_at: daysFromNow(-1, 19), ends_at: daysFromNow(-1, 20), course: 'chemistry' })
  // Never re-fit: a class that has passed, and a block ticked off.
  seedPlanItem(simulator, { id: 'class', kind: 'commitment', title: 'Biology lecture', starts_at: daysFromNow(-1, 9), ends_at: daysFromNow(-1, 10) })
  seedPlanItem(simulator, { id: 'done', kind: 'task', title: 'Done block', status: 'done', starts_at: daysFromNow(-1, 15), ends_at: daysFromNow(-1, 16) })
  // Busy all today, so the new times are tomorrow whatever the hour: always
  // one week (on a Sunday evening they could otherwise straddle two).
  seedPlanItem(simulator, { id: 'away', kind: 'commitment', title: 'Away today', starts_at: daysFromNow(0, 0), ends_at: daysFromNow(1, 0) })
}

const banner = (page: Page) => page.getByTestId('refit-banner')
const ghosts = (page: Page) => page.getByTestId('calendar-ghost')
const stored = (simulator: BackendSimulator, id: string) => simulator.db.planItems.find((p) => p.id === id)!

test('asks calmly, shows the new times as ghosts and moves them together on accept', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  await mount(<CalendarHarness />)

  await expect(banner(page)).toContainText("2 blocks didn't happen. Re-fit them?")
  await expect(page.getByText(/overdue|missed/i)).toHaveCount(0)
  await expect(ghosts(page)).toHaveCount(0)

  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  await expect(ghosts(page)).toHaveCount(2)
  await expect(ghosts(page).filter({ hasText: 'Read chapter 5' })).toBeVisible()
  await expect(banner(page)).toContainText('Here is where they could go - drag to adjust, nothing moves until you accept.')
  // The banner is the tray for these: no second "Accept all" bar.
  await expect(page.getByTestId('proposal-tray')).toHaveCount(0)
  // Nothing is written until accepted.
  expect(stored(simulator, 'missed-1').starts_at).toBe(daysFromNow(-2, 10))

  await banner(page).getByRole('button', { name: 'Move them' }).click()
  await expect(page.getByTestId('refit-note')).toHaveText("Moved 2 blocks. They're in your calendar.")
  await expect(banner(page)).toHaveCount(0)
  await expect(ghosts(page)).toHaveCount(0)
  const moved = stored(simulator, 'missed-1')
  expect(Date.parse(moved.starts_at!)).toBeGreaterThan(Date.now() - 60_000)
  expect(Date.parse(moved.ends_at!) - Date.parse(moved.starts_at!)).toBe(30 * 60_000)
  expect(stored(simulator, 'class').starts_at).toBe(daysFromNow(-1, 9))
  expect(stored(simulator, 'done').starts_at).toBe(daysFromNow(-1, 15))
})

test('keep my plan drops the ghosts, moves nothing and does not ask again', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  await mount(<CalendarHarness />)

  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  await expect(ghosts(page)).toHaveCount(2)
  await banner(page).getByRole('button', { name: 'Keep my plan' }).click()
  await expect(ghosts(page)).toHaveCount(0)
  await expect(banner(page)).toHaveCount(0)
  expect(stored(simulator, 'missed-1').starts_at).toBe(daysFromNow(-2, 10))
  expect(stored(simulator, 'missed-2').starts_at).toBe(daysFromNow(-1, 19))
})

test('one ghost can be accepted on its own; the rest stay drafted', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  await mount(<CalendarHarness />)

  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  const lab = ghosts(page).filter({ hasText: 'Lab write-up' })
  await lab.focus()
  await page.keyboard.press('Enter')
  await expect(ghosts(page)).toHaveCount(1)
  expect(Date.parse(stored(simulator, 'missed-2').starts_at!)).toBeGreaterThan(Date.now() - 60_000)
  expect(stored(simulator, 'missed-1').starts_at).toBe(daysFromNow(-2, 10))
  await expect(banner(page)).toContainText('Here is where it could go')

  // Dismissing the last one ends the preview with a note about the one moved.
  await ghosts(page).first().focus()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('refit-note')).toHaveText("Moved 1 block. It's in your calendar.")
  await expect(banner(page)).toHaveCount(0)
})

test('if the week changed since the preview, it shows fresh times instead', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  await mount(<CalendarHarness />)

  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  await expect(ghosts(page)).toHaveCount(2)
  // Ticked off elsewhere meanwhile: the server refuses the stale preview.
  stored(simulator, 'missed-1').status = 'done'
  await banner(page).getByRole('button', { name: 'Move them' }).click()

  await expect(banner(page).getByText('Your week changed, so here are fresh times.')).toBeVisible()
  await expect(ghosts(page)).toHaveCount(1)
  await expect(ghosts(page)).toContainText('Lab write-up')
  expect(stored(simulator, 'missed-2').starts_at).toBe(daysFromNow(-1, 19))
  await banner(page).getByRole('button', { name: 'Move it' }).click()
  await expect(page.getByTestId('refit-note')).toHaveText("Moved 1 block. It's in your calendar.")
})

test('if a commitment lands on a ghost meanwhile, that block gets a fresh time too, never dropped', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  await mount(<CalendarHarness />)

  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  const reading = ghosts(page).filter({ hasText: 'Read chapter 5' })
  await expect(ghosts(page)).toHaveCount(2)
  // Added in another tab: a dentist appointment right where the first ghost is.
  const label = await reading.getAttribute('aria-label')
  const [, from, to] = /(\d\d:\d\d) - (\d\d:\d\d)/.exec(label!)!
  const tomorrowAt = (hhmm: string) => {
    const d = new Date(daysFromNow(1, 0))
    d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)))
    return d.toISOString()
  }
  seedPlanItem(simulator, { id: 'dentist', kind: 'commitment', title: 'Dentist', starts_at: tomorrowAt(from), ends_at: tomorrowAt(to) })

  await banner(page).getByRole('button', { name: 'Move them' }).click()
  await expect(banner(page).getByText('Your week changed, so here are fresh times.')).toBeVisible()
  await expect(ghosts(page)).toHaveCount(2)
  await expect(reading).toBeVisible()
  expect(stored(simulator, 'missed-1').starts_at).toBe(daysFromNow(-2, 10))

  await banner(page).getByRole('button', { name: 'Move them' }).click()
  await expect(page.getByTestId('refit-note')).toHaveText("Moved 2 blocks. They're in your calendar.")
  const moved = stored(simulator, 'missed-1')
  const dentist = stored(simulator, 'dentist')
  expect(Date.parse(moved.starts_at!)).toBeGreaterThan(Date.now() - 60_000)
  expect(Date.parse(moved.ends_at!) <= Date.parse(dentist.starts_at!) || Date.parse(dentist.ends_at!) <= Date.parse(moved.starts_at!)).toBe(true)
})

test('a ghost taken out because something now covers it is asked about again, not silenced', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  await mount(<CalendarHarness />)

  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  const reading = ghosts(page).filter({ hasText: 'Read chapter 5' })
  await expect(ghosts(page)).toHaveCount(2)
  const box = await reading.getAttribute('aria-label')
  const [, from, to] = /(\d\d:\d\d) - (\d\d:\d\d)/.exec(box!)!
  const tomorrowAt = (hhmm: string) => {
    const d = new Date(daysFromNow(1, 0))
    d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)))
    return d.toISOString()
  }
  seedPlanItem(simulator, { id: 'dentist', kind: 'commitment', title: 'Dentist', starts_at: tomorrowAt(from), ends_at: tomorrowAt(to) })
  // The calendar refreshes (here: away and back), and the covered ghost is taken out.
  await page.getByRole('button', { name: 'Next week' }).click()
  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(reading).toHaveCount(0)
  await expect(page.getByTestId('calendar-notice')).toContainText('Took "Read chapter 5" out of the suggestions')

  // Keep my plan answers for the one still shown; the other is asked about again.
  await banner(page).getByRole('button', { name: 'Keep my plan' }).click()
  await expect(banner(page)).toContainText("1 block didn't happen. Re-fit it?")
  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  await expect(reading).toBeVisible()
  await expect(ghosts(page)).toHaveCount(1)
})

test('a block with no free time is named, and stays on the list', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  // Due in 5 minutes: no time left to fit an hour.
  seedPlanItem(simulator, {
    id: 'no-fit', kind: 'task', title: 'Essay plan', duration_min: 60, starts_at: daysFromNow(-1, 15), ends_at: daysFromNow(-1, 16),
    due_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  })
  await mount(<CalendarHarness />)

  await expect(banner(page)).toContainText("3 blocks didn't happen. Re-fit them?")
  await banner(page).getByRole('button', { name: 'Re-fit' }).click()
  await expect(ghosts(page)).toHaveCount(2)
  await expect(banner(page).getByTestId('refit-no-fit')).toHaveText('Essay plan: No free time before it is due. It stays on your list.')
  await banner(page).getByRole('button', { name: 'Move them' }).click()
  await expect(page.getByTestId('refit-note')).toHaveText(
    "Moved 2 blocks. They're in your calendar. 1 didn't fit before it is due, so it stays on your to-do list.",
  )
  expect(stored(simulator, 'no-fit').starts_at).toBe(daysFromNow(-1, 15))
})

test('one draft at a time: waits while Auto-fill suggestions are open', async ({ mount, page, simulator }) => {
  seedMissed(simulator)
  seedPlanItem(simulator, { id: 'todo', kind: 'task', title: 'Flashcards', duration_min: 30 })
  await mount(<CalendarHarness />)

  // Plan next week, so there is always free time ahead.
  await page.getByRole('button', { name: 'Next week' }).click()
  await page.getByTestId('help-me-plan').click()
  await page.getByTestId('autofill').click()
  await expect(ghosts(page).filter({ hasText: 'Flashcards' })).toBeVisible()

  await expect(banner(page).getByRole('button', { name: 'Re-fit' })).toBeDisabled()
  await expect(banner(page)).toContainText('Accept or keep the suggested blocks first - one draft at a time.')

  await page.getByTestId('help-me-plan-panel').getByRole('button', { name: 'Keep my plan' }).click()
  await expect(banner(page).getByRole('button', { name: 'Re-fit' })).toBeEnabled()
})
