import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { CalendarHarness } from '../../../playwright/calendar-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import type { StoredPlanItem } from '../../../playwright/backend-simulator/in-memory-db'
import { startOfWeek } from './time'

const monday = startOfWeek(new Date())
const at = (day: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h, m)
const iso = (day: number, h: number, m = 0) => at(day, h, m).toISOString()
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

function seed(simulator: BackendSimulator, rows: (Partial<StoredPlanItem> & { id: string; course?: string })[]) {
  for (const { course, ...row } of rows) {
    simulator.db.planItems.push({
      kind: 'task', title: row.id, starts_at: null, ends_at: null, due_at: null, duration_min: null,
      status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null,
      source_offset_ms: null, created_at: iso(0, 0), updated_at: iso(0, 0),
      ...row,
    } as StoredPlanItem)
    if (course) {
      simulator.db.tags.push({ id: `tag-${row.id}`, target_type: 'plan_item', target_id: row.id, label: course, created_at: iso(0, 0) })
    }
  }
}

function seedWeek(simulator: BackendSimulator) {
  seed(simulator, [
    { id: 'bio-lecture', kind: 'commitment', title: 'Biology lecture', subtype: 'class', starts_at: iso(0, 10), ends_at: iso(0, 11), recurrence: { freq: 'weekly', timeZone: tz }, course: 'biology' },
    { id: 'chem-lecture', kind: 'commitment', title: 'Chemistry lecture', subtype: 'class', starts_at: iso(1, 9), ends_at: iso(1, 10, 30), course: 'chemistry' },
    { id: 'shift', kind: 'commitment', title: 'Cafe shift', subtype: 'shift', starts_at: iso(3, 18), ends_at: iso(3, 22) },
    { id: 'quiz', kind: 'deadline', title: 'Biology quiz', due_at: iso(3, 9), course: 'biology' },
    { id: 'revise', kind: 'task', title: 'Revise respiration', starts_at: iso(2, 16), ends_at: iso(2, 17), duration_min: 60, course: 'biology' },
    {
      id: 'review', kind: 'task', title: 'Review: maternal inheritance', starts_at: iso(2, 20), ends_at: iso(2, 20, 30), duration_min: 30,
      source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 760000, course: 'biology',
    },
  ])
}

/** Viewport point for a day column and time on the grid. */
async function point(page: Page, dayIndex: number, hours: number) {
  // The grid settles after mount (data, the due row and the hour sizing can
  // each move it): measure only once it has held still, or a drag lands off.
  let grid = await page.getByTestId('calendar-grid').boundingBox()
  await expect.poll(async () => {
    const before = grid
    await page.waitForTimeout(100)
    grid = await page.getByTestId('calendar-grid').boundingBox()
    return JSON.stringify(before) === JSON.stringify(grid)
  }).toBe(true)
  const day = await page.getByTestId('calendar-day').nth(dayIndex).boundingBox()
  return { x: day!.x + day!.width / 2, y: grid!.y + (hours / 24) * grid!.height }
}

const block = (page: Page, title: string) => page.getByTestId('calendar-block').filter({ hasText: title })

test('renders the week: fixed commitments, study time and what is due', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)

  await expect(page.getByTestId('calendar-day-header')).toHaveCount(7)
  await expect(block(page, 'Biology lecture')).toHaveAttribute('data-kind', 'commitment')
  await expect(block(page, 'Cafe shift')).toBeVisible()
  await expect(block(page, 'Revise respiration')).toHaveAttribute('data-kind', 'task')
  await expect(page.getByTestId('calendar-due').filter({ hasText: 'Biology quiz' })).toBeVisible()
  await expect(page.getByTestId('help-me-plan')).toBeVisible()

  // The working day fits: 08:00 to 22:00 are on screen without scrolling.
  const scroll = await page.getByTestId('calendar-scroll').boundingBox()
  for (const h of [8, 22]) {
    const y = (await point(page, 0, h)).y
    expect(y).toBeGreaterThanOrEqual(scroll!.y)
    expect(y).toBeLessThanOrEqual(scroll!.y + scroll!.height)
  }
})

test('a weekly class repeats next week; one-off items do not', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await expect(block(page, 'Biology lecture')).toBeVisible()

  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(block(page, 'Biology lecture')).toBeVisible()
  await expect(block(page, 'Chemistry lecture')).toHaveCount(0)

  await page.getByRole('button', { name: 'Today' }).click()
  await expect(block(page, 'Chemistry lecture')).toBeVisible()
})

test('day view shows one day and navigates by day', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await page.getByRole('tab', { name: 'Day' }).click()
  await expect(page.getByTestId('calendar-day-header')).toHaveCount(1)
  await expect(page.getByTestId('help-me-plan')).toHaveCount(0)
})

test('a course highlight dims other courses but never hides them', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness highlight={{ courseTag: 'biology', recordingId: 'rec-bio-4' }} />)

  await expect(page.getByTestId('calendar-highlight')).toHaveText('Biology highlighted')
  await expect(block(page, 'Chemistry lecture')).toBeVisible()
  await expect(block(page, 'Chemistry lecture')).toHaveAttribute('data-dimmed', 'true')
  // No course (a shift) is not "another course": it stays undimmed.
  await expect(block(page, 'Cafe shift')).not.toHaveAttribute('data-dimmed')
  await expect(block(page, 'Biology lecture')).not.toHaveAttribute('data-dimmed')
  // Linked to the focused lecture.
  await expect(block(page, 'Review: maternal inheritance')).toHaveAttribute('data-linked', 'true')
  await expect(block(page, 'Revise respiration')).not.toHaveAttribute('data-linked')
})

test('click empty time to add a weekly class', async ({ mount, page, simulator }) => {
  await mount(<CalendarHarness highlight={{ courseTag: 'biology' }} />)
  await expect(page.getByText('Nothing planned')).toBeVisible()

  const p = await point(page, 1, 14.2)
  await page.mouse.click(p.x, p.y)
  const popover = page.getByTestId('calendar-popover')
  await expect(popover.getByLabel('Start time')).toHaveValue('14:00')
  await expect(popover.getByLabel('End time')).toHaveValue('15:00')
  // New items start in the board's course.
  await expect(popover.getByLabel('Course', { exact: true })).toHaveValue('biology')
  await popover.getByLabel('Title').fill('Genetics seminar')
  await popover.getByRole('checkbox', { name: 'Repeats weekly' }).check()
  await popover.getByRole('button', { name: 'Add' }).click()

  await expect(block(page, 'Genetics seminar')).toBeVisible()
  const created = simulator.db.planItems.find((p) => p.title === 'Genetics seminar')!
  expect(created).toMatchObject({ kind: 'commitment', starts_at: iso(1, 14), ends_at: iso(1, 15), recurrence: { freq: 'weekly', timeZone: tz } })

  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(block(page, 'Genetics seminar')).toBeVisible()
})

test('drag over empty time to add study time and something due', async ({ mount, page, simulator }) => {
  await mount(<CalendarHarness />)

  const from = await point(page, 3, 13.05)
  const to = await point(page, 3, 14.5)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await expect(page.getByTestId('calendar-draft')).toHaveText('13:00 - 14:30')
  await page.mouse.up()

  const popover = page.getByTestId('calendar-popover')
  await popover.getByLabel('Title').fill('Problem set')
  await popover.getByRole('radio', { name: 'Study time' }).click()
  await popover.getByRole('button', { name: 'Add' }).click()
  await expect(block(page, 'Problem set')).toHaveAttribute('data-kind', 'task')
  expect(simulator.db.planItems.find((p) => p.title === 'Problem set')).toMatchObject({
    kind: 'task', starts_at: iso(3, 13), ends_at: iso(3, 14, 30), duration_min: 90, recurrence: null,
  })

  const due = await point(page, 4, 17.1)
  await page.mouse.click(due.x, due.y)
  await popover.getByLabel('Title').fill('Lab report')
  await popover.getByRole('radio', { name: 'Due' }).click()
  await expect(popover.getByLabel('End time')).toHaveCount(0)
  await popover.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByTestId('calendar-due').filter({ hasText: 'Lab report' })).toBeVisible()
  expect(simulator.db.planItems.find((p) => p.title === 'Lab report')).toMatchObject({ kind: 'deadline', due_at: iso(4, 17) })
})

test('drag study time to another day and resize it', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  const revise = block(page, 'Revise respiration')
  await expect(revise).toBeVisible()

  // Grab 15 min into the block and drop on Friday 10:15: it starts at 10:00.
  const grab = await point(page, 2, 16.25)
  const drop = await point(page, 4, 10.25)
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 8 })
  await expect(page.getByTestId('calendar-block-preview')).toBeVisible()
  await page.mouse.up()

  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'revise')?.starts_at).toBe(iso(4, 10))
  expect(simulator.db.planItems.find((p) => p.id === 'revise')).toMatchObject({ ends_at: iso(4, 11), duration_min: 60 })
  await expect(revise).toHaveAttribute('aria-label', /10:00 - 11:00/)
  await expect(page.getByTestId('calendar-popover')).toHaveCount(0)

  // Resize from the bottom edge to 11:30.
  await revise.hover()
  const handle = await revise.getByTestId('calendar-block-resize').boundingBox()
  const end = await point(page, 4, 11.5)
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'revise')?.ends_at).toBe(iso(4, 11, 30))
  expect(simulator.db.planItems.find((p) => p.id === 'revise')).toMatchObject({ starts_at: iso(4, 10), duration_min: 90 })
})

test('commitments do not move by drag; they move by an explicit edit', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  const grab = await point(page, 3, 19)
  const drop = await point(page, 5, 12)
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 8 })
  await expect(page.getByTestId('calendar-block-preview')).toHaveCount(0)
  await page.mouse.up()
  expect(simulator.db.planItems.find((p) => p.id === 'shift')?.starts_at).toBe(iso(3, 18))

  await block(page, 'Cafe shift').click()
  const popover = page.getByTestId('calendar-popover')
  await expect(popover).toContainText('stays where it is unless you edit it')
  await popover.getByLabel('Start time').fill('17:00')
  await popover.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'shift')?.starts_at).toBe(iso(3, 17))
  expect(simulator.db.planItems.find((p) => p.id === 'shift')?.ends_at).toBe(iso(3, 21))
})

test('edit a weekly class from a later week shifts the whole series', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await page.getByRole('button', { name: 'Next week' }).click()
  await block(page, 'Biology lecture').click()
  const popover = page.getByTestId('calendar-popover')
  await expect(popover).toContainText('Changes apply to every week.')
  await popover.getByLabel('Start time').fill('11:00')
  await popover.getByRole('button', { name: 'Save' }).click()
  // The stored series (anchored this week) moved by the same hour.
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'bio-lecture')?.starts_at).toBe(iso(0, 11))
  expect(simulator.db.planItems.find((p) => p.id === 'bio-lecture')?.ends_at).toBe(iso(0, 12))
})

test('mark study time done, then delete it', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Revise respiration').click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByRole('button', { name: 'Mark done' }).click()
  await expect(block(page, 'Revise respiration')).toHaveAttribute('aria-label', /, done$/)
  expect(simulator.db.planItems.find((p) => p.id === 'revise')?.status).toBe('done')

  await block(page, 'Revise respiration').click()
  await popover.getByRole('button', { name: 'Delete' }).click()
  await popover.getByRole('button', { name: 'Delete it?' }).click()
  await expect(block(page, 'Revise respiration')).toHaveCount(0)
  expect(simulator.db.planItems.find((p) => p.id === 'revise')).toBeUndefined()
})

test('clicking a block from a lecture moment asks the board to show that moment', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Review: maternal inheritance').click()
  await expect(page.getByTestId('moment-calls')).toHaveText('rec-bio-4@760000')
  const moment = page.getByTestId('calendar-moment')
  await expect(moment).toContainText('Biology Lecture: Mitochondrial DNA')
  await expect(moment).toContainText('12:40')
  await expect(moment).toContainText('Showing this moment in the Transcript.')
})

test('without a Transcript on the board it offers one elsewhere', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness result="no-viewer" />)
  await block(page, 'Review: maternal inheritance').click()
  const moment = page.getByTestId('calendar-moment')
  await expect(moment).toContainText('This board has no Transcript.')
  await moment.getByRole('button', { name: 'Open in a board with Transcript' }).click()
  await expect(page.getByTestId('moment-calls').locator('li')).toHaveText(['rec-bio-4@760000', 'rec-bio-4@760000 elsewhere'])
  // The stub has no board with a Transcript either.
  await expect(moment).toContainText('None of your boards has a Transcript yet')
})

test('"See it" opens the week of the block, scrolls to it and glows it once with where it came from', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  // A review two weeks ahead, late in the evening (below the opening scroll).
  seed(simulator, [{
    id: 'later-review', kind: 'task', title: 'Review: paternal leakage', starts_at: iso(16, 21, 15), ends_at: iso(16, 21, 35),
    duration_min: 20, subtype: 'review', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 78000, course: 'biology',
  }])
  await mount(<CalendarHarness reveal={[{ id: 'later-review', startsAt: iso(16, 21, 15) }]} />)
  await expect(block(page, 'Biology lecture')).toBeVisible()

  await page.getByRole('button', { name: 'Reveal later-review' }).click()
  const target = block(page, 'Review: paternal leakage')
  await expect(target).toHaveAttribute('data-revealed', 'true')
  await expect(page.getByTestId('plan-item-calls').locator('li')).toHaveText(['1'])
  await expect(page.getByTestId('calendar-day-header').nth(2)).toContainText(String(at(16, 0).getDate()))
  await expect(target).toBeInViewport()
  const callout = page.getByTestId('calendar-reveal')
  await expect(callout).toContainText('Review: paternal leakage')
  await expect(callout).toContainText('From Biology Lecture: Mitochondrial DNA · 1:18')
  await expect(callout).toContainText('Wed 21:15 - 21:35 · 20 min')
  // It glows once, in its course colour.
  await expect(target).toHaveCSS('animation-name', 'glow-once')
  // Then settles.
  await expect(target).not.toHaveAttribute('data-revealed', 'true', { timeout: 6000 })
  await expect(callout).toHaveCount(0)
})

test('with reduced motion a revealed block holds a still ring instead of glowing', async ({ mount, page, simulator }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  seedWeek(simulator)
  await mount(<CalendarHarness reveal={[{ id: 'review', startsAt: iso(2, 20) }]} />)
  await page.getByRole('button', { name: 'Reveal review' }).click()
  const target = block(page, 'Review: maternal inheritance')
  await expect(target).toHaveAttribute('data-revealed', 'true')
  await expect(target).toHaveCSS('animation-name', 'none')
  await expect(target).not.toHaveCSS('box-shadow', 'none')
  await expect(target).toBeInViewport()
})

test('the next and previous weeks are fetched by date range', async ({ mount, page, simulator }) => {
  seed(simulator, [{ id: 'later', kind: 'commitment', title: 'Field trip', starts_at: iso(9, 9), ends_at: iso(9, 12) }])
  await mount(<CalendarHarness />)
  await expect(block(page, 'Field trip')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(block(page, 'Field trip')).toBeVisible()
  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(block(page, 'Field trip')).toHaveCount(0)
})

test('a move that does not save says so and puts the block back', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await expect(block(page, 'Revise respiration')).toBeVisible()
  // Registered after the simulator's route, so it wins for updates only.
  await page.route('**/planItems.update**', (route) => route.fulfill({ status: 500, body: '{}' }))

  const grab = await point(page, 2, 16.25)
  const drop = await point(page, 4, 10.25)
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByTestId('calendar-notice')).toContainText(`Couldn't move "Revise respiration"`)
  await expect(block(page, 'Revise respiration')).toHaveAttribute('aria-label', /16:00 - 17:00/)
  expect(simulator.db.planItems.find((p) => p.id === 'revise')?.starts_at).toBe(iso(2, 16))
})

test('a moment that fails to open offers to try again', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness result="fail" />)
  await block(page, 'Review: maternal inheritance').click()
  const moment = page.getByTestId('calendar-moment')
  await expect(moment).toContainText("Couldn't open the moment just now.")
  await expect(moment).not.toContainText('Opening the moment')
  await moment.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('moment-calls').locator('li')).toHaveCount(2)
})

test('keyboard: Enter opens a block with focus inside, Escape returns focus; Add creates', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  const shift = block(page, 'Cafe shift')
  await shift.focus()
  await page.keyboard.press('Enter')
  const popover = page.getByTestId('calendar-popover')
  await expect(popover.getByLabel('Title')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await expect(shift).toBeFocused()

  const add = page.getByRole('button', { name: 'Add to calendar' })
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(popover.getByLabel('Title')).toBeFocused()
  await page.keyboard.type('Reading week plan')
  await page.keyboard.press('Enter')
  await expect(block(page, 'Reading week plan')).toBeVisible()
  await expect(add).toBeFocused()
})

test('a 20-minute block keeps a legible title and its time in the tooltip', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seed(simulator, [{ id: 'short', kind: 'task', title: 'Quick review', starts_at: iso(4, 19), ends_at: iso(4, 19, 20), duration_min: 20 }])
  await mount(<CalendarHarness />)
  const short = block(page, 'Quick review')
  expect((await short.boundingBox())!.height).toBeGreaterThanOrEqual(22)
  await expect(short).toHaveAttribute('title', /19:00 - 19:20/)
  await expect(short.getByText('Quick review')).toBeVisible()
})

test("resizing stays within the block's own day", async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  const revise = block(page, 'Revise respiration')
  await revise.hover()
  const handle = await revise.getByTestId('calendar-block-resize').boundingBox()
  const into = await point(page, 3, 10)
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
  await page.mouse.down()
  await page.mouse.move(into.x, into.y, { steps: 6 })
  await page.mouse.up()
  // Dragged into Thursday: the end stops at Wednesday midnight.
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'revise')?.ends_at).toBe(iso(3, 0))
})

test('a September weekly class stays at its local time through the clock-change week', async ({ mount, page, simulator }) => {
  // Mondays 10:00 Europe/London, first on 7 Sep 2026 (BST); clocks go back on Sun 25 Oct.
  seed(simulator, [{
    id: 'sept', kind: 'commitment', title: 'Autumn lecture', starts_at: '2026-09-07T09:00:00.000Z', ends_at: '2026-09-07T10:00:00.000Z',
    recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
  }])
  await mount(<CalendarHarness />)
  // Navigate to the week of Mon 19 Oct 2026 from wherever "today" is.
  const weeks = Math.round((new Date(2026, 9, 19).getTime() - monday.getTime()) / (7 * 24 * 3600 * 1000))
  for (let i = 0; i < Math.abs(weeks); i++) {
    await page.getByRole('button', { name: weeks < 0 ? 'Previous week' : 'Next week' }).click()
  }
  await expect(page.getByTestId('calendar-title')).toHaveText('19 - 25 Oct 2026')
  await expect(block(page, 'Autumn lecture')).toHaveAttribute('aria-label', /10:00 - 11:00/)
  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page.getByTestId('calendar-title')).toHaveText('26 Oct - 1 Nov 2026')
  await expect(block(page, 'Autumn lecture')).toHaveAttribute('aria-label', /10:00 - 11:00/)
})
