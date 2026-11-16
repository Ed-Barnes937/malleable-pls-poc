import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { CalendarHarness } from '../../../playwright/calendar-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import type { StoredPlanItem } from '../../../playwright/backend-simulator/in-memory-db'
import { addDays, formatFullDay, startOfDay, startOfWeek } from './time'

const monday = startOfWeek(new Date())
const at = (day: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h, m)
const iso = (day: number, h: number, m = 0) => at(day, h, m).toISOString()
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

function seed(simulator: BackendSimulator, rows: (Partial<StoredPlanItem> & { id: string })[]) {
  for (const { course, ...row } of rows) {
    simulator.db.planItems.push({
      kind: 'task', title: row.id, starts_at: null, ends_at: null, due_at: null, duration_min: null,
      status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null,
      source_offset_ms: null, course: course ?? null, created_at: iso(0, 0), updated_at: iso(0, 0),
      ...row,
    } as StoredPlanItem)
  }
}

function seedWeek(simulator: BackendSimulator, base = monday) {
  const at = (day: number, h: number, m = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + day, h, m)
  const iso = (day: number, h: number, m = 0) => at(day, h, m).toISOString()
  seed(simulator, [
    { id: 'bio-lecture', kind: 'commitment', title: 'Biology lecture', subtype: 'class', starts_at: iso(0, 10), ends_at: iso(0, 11), recurrence: { freq: 'weekly', timeZone: tz }, course: 'biology' },
    { id: 'chem-lecture', kind: 'commitment', title: 'Chemistry lecture', subtype: 'class', starts_at: iso(1, 9), ends_at: iso(1, 10, 30), course: 'chemistry' },
    { id: 'shift', kind: 'commitment', title: 'Cafe shift', subtype: 'shift', starts_at: iso(3, 18), ends_at: iso(3, 22) },
    { id: 'quiz', kind: 'deadline', title: 'Biology quiz', due_at: iso(3, 9), course: 'biology' },
    { id: 'revise', kind: 'task', title: 'Revise respiration', starts_at: iso(2, 16), ends_at: iso(2, 17), duration_min: 60, course: 'biology' },
    {
      // Made by the confusion automation from a moment marked confusing (seg-bio4-04, 9:00).
      id: 'review', kind: 'task', title: 'Review: maternal inheritance', starts_at: iso(2, 20), ends_at: iso(2, 20, 30), duration_min: 30,
      source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000, course: 'biology',
      created_by_workflow_id: 'wf-confused-review',
    },
  ])
}

/** Viewport point for a day column and time on the grid. */
async function point(page: Page, dayIndex: number, hours: number) {
  // The grid re-fits its hour height as rows load: measure only once it has
  // stopped moving (as CalendarPom does in e2e).
  let last = ''
  await expect.poll(async () => {
    const box = JSON.stringify(await page.getByTestId('calendar-grid').boundingBox())
    const settled = box === last
    last = box
    return settled
  }, { intervals: [100] }).toBe(true)
  const grid = await page.getByTestId('calendar-grid').boundingBox()
  const day = await page.getByTestId('calendar-day').nth(dayIndex).boundingBox()
  return { x: day!.x + day!.width / 2, y: grid!.y + (hours / 24) * grid!.height }
}

const block = (page: Page, title: string) => page.getByTestId('calendar-block').filter({ hasText: title })

/** Mondays of the weeks the clock is frozen in: a plain week, and the week of the autumn clock change (Sun 25 Oct 2026, London). */
const FROZEN_MONDAY = new Date(2026, 9, 26)
const DST_MONDAY = new Date(2026, 9, 19)

/**
 * Freeze "now" before mounting, in the browser (Date only; timers keep
 * running) and in the simulated server (which decides what was missed), so
 * nothing here depends on the day or hour the suite runs.
 */
async function freezeAt(page: Page, simulator: BackendSimulator, day: Date, h: number, m = 0) {
  const now = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
  await page.clock.setFixedTime(now)
  simulator.freezeNow(now)
}

test('renders the week: fixed commitments, study time and what is due', async ({ mount, page, simulator }) => {
  // Monday morning: nothing has been missed yet, so no re-fit banner takes
  // room from the grid (it appears, and the grid scrolls, once study blocks pass).
  await freezeAt(page, simulator, FROZEN_MONDAY, 9)
  seedWeek(simulator, FROZEN_MONDAY)
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

// The hour rows are the same whichever day it is, with or without the re-fit
// banner at the grid's foot (which appears once study blocks have passed): 24
// equal rows, 08:00 at the top, and 22:00 within the window or one scroll
// away. The rows are fitted to the grid's room with the banner's, so the
// banner only covers the last hours shown, never re-sizes them.
const FROZEN_DAYS: [string, Date, number, number][] = [
  ['Mon', FROZEN_MONDAY, 9, 0], ['Tue', addDays(FROZEN_MONDAY, 1), 12, 0], ['Wed', addDays(FROZEN_MONDAY, 2), 21, 0],
  ['Thu', addDays(FROZEN_MONDAY, 3), 10, 0], ['Fri', addDays(FROZEN_MONDAY, 4), 23, 30],
  ['Sat', addDays(FROZEN_MONDAY, 5), 8, 0], ['Sun', addDays(FROZEN_MONDAY, 6), 18, 0],
  ['DST Sat', addDays(DST_MONDAY, 5), 12, 0], ['DST Sun (clock change)', addDays(DST_MONDAY, 6), 12, 0],
  ['DST Mon after change', FROZEN_MONDAY, 0, 30],
]
for (const [label, day, h, m] of FROZEN_DAYS) {
  test(`hour rows stay true to scale on ${label}`, async ({ mount, page, simulator }) => {
    const base = startOfWeek(day)
    await freezeAt(page, simulator, day, h, m)
    seedWeek(simulator, base)
    await mount(<CalendarHarness />)
    await expect(page.getByTestId('calendar-day-header')).toHaveCount(7)
    await expect(block(page, 'Biology lecture')).toBeVisible()

    await point(page, 0, 12) // waits for the grid to stop re-fitting
    const scroll = (await page.getByTestId('calendar-scroll').boundingBox())!
    const grid = (await page.getByTestId('calendar-grid').boundingBox())!
    const prompts = (await page.getByTestId('calendar-prompts').boundingBox())?.height ?? 0
    const room = scroll.height + prompts
    // 24 rows of one height, never cramped below 32px.
    const hourPx = grid.height / 24
    expect(hourPx).toBeGreaterThanOrEqual(32 - 0.5)
    // Starts scrolled to 08:00 (a little headroom for its label).
    expect(grid.y - scroll.y + (8 / 24) * grid.height).toBeCloseTo(8, 0)
    // The whole working day fits when the window is tall enough for it, else
    // the bottom of the grid is a scroll away: never a short grid.
    const fits = room >= 14 * 32 + 16
    if (fits) {
      expect(grid.y + (22 / 24) * grid.height).toBeLessThanOrEqual(scroll.y + room)
    } else {
      expect(hourPx).toBeCloseTo(32, 0)
      await page.getByTestId('calendar-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight })
      const after = (await page.getByTestId('calendar-grid').boundingBox())!
      expect(after.y + (22 / 24) * after.height).toBeLessThanOrEqual(scroll.y + scroll.height)
    }
  })
}

// Any scroll the student (or a block shown) makes keeps its place, not only
// touch, wheel and keys: a scrollbar drag or scrollIntoView used to snap back
// to 08:00 the next time the panel resized.
test('a scroll by any means keeps its place when the panel resizes', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  const component = await mount(<CalendarHarness height={400} />)
  await expect(block(page, 'Biology lecture')).toBeVisible()
  await point(page, 0, 12) // waits for the grid to stop re-fitting
  const scroll = page.getByTestId('calendar-scroll')
  const bottom = await scroll.evaluate(async (el) => {
    el.scrollTop = el.scrollHeight
    await new Promise((resolve) => el.addEventListener('scrollend', resolve, { once: true }))
    return el.scrollTop
  })
  expect(bottom).toBeGreaterThan(0)

  await component.update(<CalendarHarness height={420} />)
  await point(page, 0, 12)
  const box = (await scroll.boundingBox())!
  const grid = (await page.getByTestId('calendar-grid').boundingBox())!
  // 22:00 is still in view, not scrolled away to 08:00.
  expect(grid.y + (22 / 24) * grid.height).toBeLessThanOrEqual(box.y + box.height)
})

test('block language: a class is a solid course tint, a shift neutral with a cup, study time a soft tint with a bar and a grab handle', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)

  const lecture = block(page, 'Biology lecture')
  await expect(lecture).toHaveAttribute('data-look', 'class')
  await expect(lecture).toHaveClass(/bg-course-green-tint/)
  await expect(lecture.getByTestId('calendar-grip')).toHaveCount(0)

  const shift = block(page, 'Cafe shift')
  await expect(shift).toHaveAttribute('data-look', 'shift')
  await expect(shift).toHaveClass(/bg-shift/)
  await expect(shift.getByTestId('calendar-shift-icon')).toBeVisible()
  await expect(shift.getByTestId('calendar-grip')).toHaveCount(0)

  const study = block(page, 'Revise respiration')
  await expect(study).toHaveAttribute('data-look', 'study')
  await expect(study).toHaveClass(/bg-course-green-soft/)
  await expect(study.getByTestId('calendar-grip')).toBeVisible()
  await expect(study.getByTestId('calendar-shift-icon')).toHaveCount(0)

  // Free time is only outlined while planning.
  await expect(page.getByTestId('calendar-free')).toHaveCount(0)
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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 800 } })

  test('opens in Day view on today, with the previous and next day either side', async ({ mount, page, simulator }) => {
    seedWeek(simulator)
    // Saved as Week on a wide screen: a phone still opens on the day.
    await mount(<CalendarHarness config={{ view: 'week' }} width="100%" />)

    await expect(page.getByRole('tab', { name: 'Day' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('calendar-day-header')).toHaveCount(1)
    const today = new Date()
    await expect(page.getByTestId('calendar-title')).toHaveText(formatFullDay(today))
    await expect(page.getByText('Today', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByTestId('calendar-title')).toHaveText(formatFullDay(addDays(startOfDay(today), 1)))
    await page.getByRole('button', { name: 'Back to today' }).click()
    await expect(page.getByTestId('calendar-title')).toHaveText(formatFullDay(today))
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByTestId('calendar-title')).toHaveText(formatFullDay(addDays(startOfDay(today), -1)))

    // Week is a tap away, and picking a view on the phone leaves the saved one alone.
    await page.getByRole('tab', { name: 'Week' }).click()
    await expect(page.getByTestId('calendar-day-header')).toHaveCount(7)
    await expect(page.getByTestId('config-calls').getByRole('listitem')).toHaveCount(0)
  })

  test('back on a wide screen, the saved view returns', async ({ mount, page, simulator }) => {
    seedWeek(simulator)
    await mount(<CalendarHarness config={{ view: 'week' }} width="100%" />)
    await expect(page.getByTestId('calendar-day-header')).toHaveCount(1)

    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(page.getByTestId('calendar-day-header')).toHaveCount(7)
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible()

    await page.setViewportSize({ width: 400, height: 800 })
    await expect(page.getByTestId('calendar-day-header')).toHaveCount(1)
  })
})

test('on a wide screen, picking a view saves it', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await page.getByRole('tab', { name: 'Day' }).click()
  await expect(page.getByTestId('config-calls')).toHaveText('{"view":"day"}')
})

test('a course highlight dims other courses but never hides them', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness highlight={{ courseTag: 'biology', lectureId: 'lec-rec-bio-4' }} />)

  await expect(page.getByTestId('calendar-highlight')).toHaveText('Biology highlighted')
  await expect(block(page, 'Chemistry lecture')).toBeVisible()
  await expect(block(page, 'Chemistry lecture')).toHaveAttribute('data-dimmed', 'true')
  // No course (a shift) is not "another course": it stays undimmed.
  await expect(block(page, 'Cafe shift')).not.toHaveAttribute('data-dimmed')
  await expect(block(page, 'Biology lecture')).not.toHaveAttribute('data-dimmed')
  // Linked to the selected lecture (made from a moment of its recording).
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
    // Study time made on the calendar is just a block: no estimate (flow-audit decision 15).
    kind: 'task', starts_at: iso(3, 13), ends_at: iso(3, 14, 30), duration_min: null, recurrence: null,
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
  // Lengthened past its 1h estimate: the estimate rises to the 1h 30m booked (flow-audit decision 16).
  expect(simulator.db.planItems.find((p) => p.id === 'revise')).toMatchObject({ starts_at: iso(4, 10), duration_min: 90 })

  // Shortened to 10:30: the block is the time booked, and the estimate is never lowered (decision 8).
  await revise.hover()
  const edge = await revise.getByTestId('calendar-block-resize').boundingBox()
  const shorter = await point(page, 4, 10.5)
  await page.mouse.move(edge!.x + edge!.width / 2, edge!.y + edge!.height / 2)
  await page.mouse.down()
  await page.mouse.move(shorter.x, shorter.y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'revise')?.ends_at).toBe(iso(4, 10, 30))
  expect(simulator.db.planItems.find((p) => p.id === 'revise')?.duration_min).toBe(90)
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

test('deleting a weekly class is confirmed with Undo, which brings back the whole series as it was', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  simulator.db.lectures.push({ id: 'lec-class', title: 'Biology lecture', course: 'biology', starts_at: iso(0, 10), class_item_id: 'bio-lecture', class_date: iso(0, 0).slice(0, 10) } as never)
  const before = structuredClone(simulator.db.planItems.find((p) => p.id === 'bio-lecture'))
  await mount(<CalendarHarness toasts />)

  await block(page, 'Biology lecture').click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByRole('button', { name: 'Delete' }).click()
  await popover.getByRole('button', { name: 'Delete every week?' }).click()
  await expect(block(page, 'Biology lecture')).toHaveCount(0)
  const toast = page.getByTestId('toast')
  await expect(toast).toContainText('Deleted "Biology lecture"')

  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(block(page, 'Biology lecture')).toHaveCount(1)
  expect(simulator.db.planItems.find((p) => p.id === 'bio-lecture')).toEqual(before)
  expect(simulator.db.planItems.find((p) => p.id === 'bio-lecture')?.course).toBe('biology')
  expect(simulator.db.lectures.find((l) => l.id === 'lec-class')?.class_item_id).toBe('bio-lecture')
  // Next week has it too.
  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(block(page, 'Biology lecture')).toHaveCount(1)
})

test('while a save is pending the popover fields are read-only, still legible, and take no edits', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  // Registered after the simulator's route, so it wins for updates only.
  await page.route('**/planItems.update**', async (route) => {
    await held
    await route.fallback()
  })
  await block(page, 'Biology lecture').click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByLabel('Start time').fill('11:00')
  await popover.getByRole('button', { name: 'Save' }).click()
  await expect(popover.getByRole('button', { name: 'Saving...' })).toHaveAttribute('aria-busy', 'true')

  const title = popover.getByLabel('Title')
  const start = popover.getByLabel('Start time')
  const course = popover.getByLabel('Course', { exact: true })
  const weekly = popover.getByRole('checkbox', { name: 'Repeats weekly' })
  for (const field of [title, start, popover.getByLabel('End time'), popover.getByLabel('Date')]) {
    await expect(field).toHaveJSProperty('readOnly', true)
    await expect(field).toBeEnabled()
    // Not greyed out: still legible.
    await expect(field).toHaveCSS('opacity', '1')
  }
  await expect(course).toHaveAttribute('aria-readonly', 'true')
  await expect(weekly).toHaveAttribute('aria-readonly', 'true')

  // Typing and picking do nothing.
  await title.focus()
  await page.keyboard.type('Zzz')
  await expect(title).toHaveValue('Biology lecture')
  await expect(title).toBeFocused()
  await course.selectOption('physics')
  await expect(course).toHaveValue('biology')
  await weekly.click()
  await expect(weekly).toBeChecked()
  await expect(start).toHaveValue('11:00')

  release()
  await expect(popover).toHaveCount(0)
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'bio-lecture')?.starts_at).toBe(iso(0, 11))
  expect(simulator.db.planItems.find((p) => p.id === 'bio-lecture')?.title).toBe('Biology lecture')
})

test('a block from a lecture moment leads with where it came from', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Review: maternal inheritance').click()
  const popover = page.getByRole('dialog', { name: 'Review: maternal inheritance' })
  await expect(popover.getByTestId('calendar-moment-source')).toHaveText('From Biology Lecture: Mitochondrial DNA · 9:00')
  const quote = popover.getByTestId('calendar-moment-quote')
  // Marked both confusing and a key point: confusion leads.
  await expect(quote).toContainText('You marked this confusing')
  await expect(quote).toContainText('"Here\'s the critical point: mitochondrial DNA is inherited exclusively from the maternal line.')
  await expect(popover).toContainText('Biology')
  await expect(popover).toContainText('20:00-20:30')
  await expect(popover).toContainText('30 min')
  // Nothing opens until the student asks: "Go to moment" leads, and has focus.
  await expect(page.getByTestId('moment-calls').locator('li')).toHaveCount(0)
  await expect(popover.getByRole('button', { name: 'Go to moment' })).toBeFocused()
  // The date and time pickers wait behind "Edit time".
  await expect(popover.getByLabel('Start time')).toHaveCount(0)
  await expect(popover.getByTestId('calendar-made-by')).toHaveText(
    'Made by "When I mark something confusing, add a 20-min review within 3 days". Edit',
  )  // Stays inside the calendar once everything in it has loaded.
  const box = (await popover.boundingBox())!
  const cal = (await page.getByTestId('calendar').boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(cal.y + cal.height)
})

test('"Go to moment" asks the board to show that moment', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Review: maternal inheritance').click()
  await page.getByRole('button', { name: 'Go to moment' }).click()
  await expect(page.getByTestId('moment-calls').locator('li')).toHaveText(['rec-bio-4@540000'])
  await expect(page.getByTestId('calendar-moment')).toContainText('Showing this moment in the Transcript.')
})

test('when no board has a Transcript, "Go to moment" says how to get one', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  // `no-viewer`: the shell found no board with a Transcript (it opens one elsewhere when it can).
  await mount(<CalendarHarness result="no-viewer" />)
  await block(page, 'Review: maternal inheritance').click()
  await page.getByRole('button', { name: 'Go to moment' }).click()
  const moment = page.getByTestId('calendar-moment')
  await expect(moment).toHaveText('None of your boards has a Transcript yet. Add one from the widget drawer to see this moment.')
  await expect(page.getByTestId('moment-calls').locator('li')).toHaveText(['rec-bio-4@540000'])
})

test('"Edit" in the footer opens the automation that made the block', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Review: maternal inheritance').click()
  await page.getByTestId('calendar-made-by').getByRole('button', { name: 'Edit automation' }).click()
  await expect(page.getByTestId('moment-calls').locator('li')).toHaveText(['edit wf-confused-review'])
})

test('a block no automation made has no "Made by" footer', async ({ mount, page, simulator }) => {
  seed(simulator, [{
    id: 'by-hand', kind: 'task', title: 'Review: by hand', starts_at: iso(2, 20), ends_at: iso(2, 20, 30), duration_min: 30,
    source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 760000, course: 'biology',
  }])
  await mount(<CalendarHarness />)
  await block(page, 'Review: by hand').click()
  const popover = page.getByRole('dialog', { name: 'Review: by hand' })
  await expect(popover.getByTestId('calendar-moment-source')).toHaveText('From Biology Lecture: Mitochondrial DNA · 12:40')
  // An untagged moment: the line, with no mark.
  await expect(popover.getByTestId('calendar-moment-quote')).not.toContainText('You marked')
  await expect(popover.getByTestId('calendar-made-by')).toHaveCount(0)
})

test('"Mark done" and "Edit time" on a block from a lecture moment', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Review: maternal inheritance').click()
  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(block(page, 'Review: maternal inheritance')).toHaveAttribute('aria-label', /, done$/)

  await block(page, 'Review: maternal inheritance').click()
  await page.getByRole('button', { name: 'Edit time' }).click()
  const form = page.getByRole('dialog', { name: 'Edit Review: maternal inheritance' })
  await form.getByLabel('Start time').fill('21:00')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(block(page, 'Review: maternal inheritance')).toHaveAttribute('aria-label', /21:00 - 21:30/)
  expect(simulator.db.planItems.find((p) => p.id === 'review')?.starts_at).toBe(iso(2, 21))
})

test('an open popover follows its block when something else moves it', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Review: maternal inheritance').click()
  const popover = page.getByRole('dialog', { name: 'Review: maternal inheritance' })
  await expect(popover).toContainText('20:00-20:30')

  // The automation moves it (as editing its params does on the server), and the calendar refetches.
  const stored = simulator.db.planItems.find((p) => p.id === 'review')!
  Object.assign(stored, { starts_at: iso(3, 9), ends_at: iso(3, 9, 20), duration_min: 20, updated_at: new Date().toISOString() })
  // Coming back to the tab refetches (React Query's refetch on focus).
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))

  await expect(popover).toContainText('09:00-09:20')
  await expect(popover).toContainText('20 min')
  // The time form, opened now, starts from the new time too.
  await popover.getByRole('button', { name: 'Edit time' }).click()
  await expect(page.getByLabel('Start time')).toHaveValue('09:00')
})

test('"See it" opens the week of the block, scrolls to it and glows it once with where it came from', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  // A review two weeks ahead, late in the evening (below the opening scroll).
  seed(simulator, [{
    id: 'later-review', kind: 'task', title: 'Review: paternal leakage', starts_at: iso(16, 21, 15), ends_at: iso(16, 21, 35),
    duration_min: 20, subtype: 'review', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 78000, course: 'biology',
  }])
  // The glow's timers wait for the test, however slowly the machine runs.
  await page.clock.install()
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
  await page.clock.runFor(4000)
  await expect(target).not.toHaveAttribute('data-revealed', 'true')
  await expect(callout).toHaveCount(0)
})

// The hours re-fit (a row above the grid going as the block's week lands,
// the panel resized) just as "See it" starts, or while the grid is on its
// way to the block: it still lands on the block.
for (const when of ['just before', 'while'] as const) {
  test(`"See it" lands on the block when the hours re-fit ${when} the grid scrolls to it`, async ({ mount, page, simulator }) => {
    // Thursday morning, whatever day the suite runs: Wednesday's study block
    // has passed, so the re-fit prompt sits under the hours, over the
    // evening, and the block takes a scroll to reach (earlier in the week
    // the grid shows it already and never scrolls).
    await freezeAt(page, simulator, addDays(monday, 3), 9)
    seedWeek(simulator)
    seed(simulator, [{
      id: 'later-review', kind: 'task', title: 'Review: paternal leakage', starts_at: iso(4, 21, 15), ends_at: iso(4, 21, 35),
      duration_min: 20, subtype: 'review', course: 'biology',
    }])
    await mount(<CalendarHarness reveal={[{ id: 'later-review', startsAt: iso(4, 21, 15) }]} />)
    await expect(block(page, 'Biology lecture')).toBeVisible()
    // The grid has settled at the day's start.
    const scroll = page.getByTestId('calendar-scroll')
    let last = -1
    await expect.poll(async () => {
      const top = await scroll.evaluate((el) => el.scrollTop)
      const settled = top === last
      last = top
      return settled
    }, { intervals: [100] }).toBe(true)

    await page.evaluate((when) => new Promise<void>((resolve) => {
      const grid = document.querySelector<HTMLElement>('[data-testid="calendar-scroll"]')!
      const panel = document.querySelector<HTMLElement>('[data-testid="calendar-panel"]')!
      const reveal = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Reveal later-review')!
      if (when === 'just before') {
        // Taller in the same task as the click: the hours haven't re-fitted yet as the block is shown.
        panel.style.height = '700px'
        reveal.click()
        resolve()
        return
      }
      const from = grid.scrollTop
      const onScroll = () => {
        if (grid.scrollTop <= from) return
        grid.removeEventListener('scroll', onScroll)
        panel.style.height = '700px'
        resolve()
      }
      grid.addEventListener('scroll', onScroll)
      reveal.click()
    }), when)
    const target = block(page, 'Review: paternal leakage')
    await expect(target).toHaveAttribute('data-revealed', 'true')
    await expect(target).toBeInViewport()
  })
}

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

test('a move that does not save says so and puts the block back', async ({ mount, page, simulator, consoleErrors }) => {
  consoleErrors.allowFailedRequest('planItems.update')
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
  await page.getByRole('button', { name: 'Go to moment' }).click()
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

test('a 20-minute block, drawn to scale, reads by its title in a caption just under it', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seed(simulator, [{ id: 'short', kind: 'task', title: 'Quick review', starts_at: iso(4, 19), ends_at: iso(4, 19, 20), duration_min: 20 }])
  await mount(<CalendarHarness />)
  const short = block(page, 'Quick review')
  await expect(short).toHaveAttribute('title', /19:00 - 19:20/)
  await expect(short).toHaveAttribute('aria-label', /^Quick review, study time, 19:00 - 19:20$/)
  const caption = short.getByTestId('calendar-block-caption')
  await expect(caption).toHaveText('Quick review')
  await expect(caption).toHaveAttribute('data-side', 'below')
  await expect(caption).toBeVisible()
  // Settled grid, then: one whole, uncut line of 12px text right under the block.
  await point(page, 0, 12)
  const box = (await short.boundingBox())!
  const text = (await caption.boundingBox())!
  expect(await caption.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
  expect(text.height).toBeGreaterThanOrEqual(16)
  expect(text.y).toBeGreaterThanOrEqual(box.y + box.height)
  expect(text.y).toBeLessThanOrEqual(box.y + box.height + 2)
  expect(await caption.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  // The block keeps its own size: the caption is beside it, not in it.
  expect(box.height).toBeLessThan(16)
  await expect(short.getByTestId('calendar-block-title')).toBeHidden()
  // The caption is the block: clicking it opens the block.
  await caption.click()
  await expect(page.getByTestId('calendar-popover')).toBeVisible()
})

test('a 20-minute block moves wherever it is pressed: no edge of the thin bar resizes it', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seed(simulator, [{ id: 'short', kind: 'task', title: 'Quick review', starts_at: iso(4, 19), ends_at: iso(4, 19, 20), duration_min: 20 }])
  await mount(<CalendarHarness />)
  const short = block(page, 'Quick review')
  await point(page, 0, 12)
  await short.hover()
  await expect(short.getByTestId('calendar-block-resize')).toHaveCount(0)
  const box = (await short.boundingBox())!
  // Press its lowest pixel, where a resize edge would be, and drop it on Saturday.
  const drop = await point(page, 5, 15 + (box.height - 1) / box.height / 3)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 1)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'short')?.starts_at).toBe(iso(5, 15))
  expect(simulator.db.planItems.find((p) => p.id === 'short')).toMatchObject({ ends_at: iso(5, 15, 20), duration_min: 20 })
})

test('blocks are drawn to scale: a 30-minute review is longer than a 20-minute one at the default zoom', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seed(simulator, [
    { id: 'twenty', kind: 'task', title: 'Review twenty', starts_at: iso(4, 19), ends_at: iso(4, 19, 20), duration_min: 20 },
    { id: 'thirty', kind: 'task', title: 'Review thirty', starts_at: iso(5, 19), ends_at: iso(5, 19, 30), duration_min: 30 },
    { id: 'hour', kind: 'task', title: 'Review hour', starts_at: iso(6, 19), ends_at: iso(6, 20), duration_min: 60 },
  ])
  await mount(<CalendarHarness />)
  await expect(block(page, 'Review hour')).toBeVisible()
  // Measure only once the grid has settled at its hour height (it re-fits as rows load).
  await point(page, 0, 12)
  const heightOf = async (title: string) => (await block(page, title).boundingBox())!.height
  const hourPx = (await heightOf('Review hour')) + 2
  // The default zoom fits 08:00-22:00, so short blocks are small: they still differ.
  expect(await heightOf('Review twenty')).toBeCloseTo(hourPx / 3 - 2, 0)
  expect(await heightOf('Review thirty')).toBeCloseTo(hourPx / 2 - 2, 0)
  expect((await heightOf('Review thirty')) - (await heightOf('Review twenty'))).toBeGreaterThanOrEqual(4)
})

test("a 15-minute block right before another puts its caption over itself, never on the next block", async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seed(simulator, [
    { id: 'quick', kind: 'task', title: 'Quick check', starts_at: iso(4, 19), ends_at: iso(4, 19, 15), duration_min: 15 },
    { id: 'next', kind: 'commitment', title: 'Next block', starts_at: iso(4, 19, 15), ends_at: iso(4, 20, 15) },
  ])
  await mount(<CalendarHarness />)
  const quick = block(page, 'Quick check')
  const caption = quick.getByTestId('calendar-block-caption')
  await expect(caption).toHaveAttribute('data-side', 'above')
  // The grid re-fits as rows load: sample positions only once it has settled.
  await point(page, 0, 12)
  const box = (await caption.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual((await quick.boundingBox())!.y)
  const next = (await block(page, 'Next block').boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(next.y)
  // What is drawn at the top and bottom of the caption is the short block itself.
  for (const y of [box.y + 1, box.y + box.height - 1]) {
    const owner = await page.evaluate(([x, yy]) => document.elementFromPoint(x, yy)?.closest('[data-testid="calendar-block"]')?.textContent, [box.x + 10, y])
    expect(owner).toContain('Quick check')
  }
})

test("a short block with blocks right above and below keeps its title inside, painted over its neighbours", async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seed(simulator, [
    { id: 'before', kind: 'commitment', title: 'Before block', starts_at: iso(4, 18), ends_at: iso(4, 19) },
    { id: 'quick', kind: 'task', title: 'Quick check', starts_at: iso(4, 19), ends_at: iso(4, 19, 15), duration_min: 15 },
    { id: 'next', kind: 'commitment', title: 'Next block', starts_at: iso(4, 19, 15), ends_at: iso(4, 20, 15) },
  ])
  await mount(<CalendarHarness />)
  const quick = block(page, 'Quick check')
  await expect(quick.getByTestId('calendar-block-caption')).toHaveCount(0)
  const title = quick.getByTestId('calendar-block-title')
  await expect(title).toBeVisible()
  await point(page, 0, 12)
  const box = (await title.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(12)
  for (const y of [box.y + 1, box.y + box.height - 1]) {
    const owner = await page.evaluate(([x, yy]) => document.elementFromPoint(x, yy)?.closest('[data-testid="calendar-block"]')?.textContent, [box.x + 10, y])
    expect(owner).toContain('Quick check')
  }
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

test('the source line wraps only where it reads well: never on its spaced dash, the time with the last word', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  // The demo's upload title, which used to wrap as "From Mitochondrial DNA - / today · 9:00".
  simulator.db.recordings.find((r) => r.id === 'rec-bio-4')!.title = 'Mitochondrial DNA - today'
  await mount(<CalendarHarness />)
  await block(page, 'Review: maternal inheritance').click()
  const source = page.getByTestId('calendar-popover').getByTestId('calendar-moment-source')
  await expect(source).toHaveText('From Mitochondrial DNA - today · 9:00')
  // Read the text's own lines: each line's first and last word.
  const lines = await source.evaluate((el) => {
    const range = document.createRange()
    const out: { top: number; text: string }[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      for (let i = 0; i < text.length; i++) {
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const top = Math.round(range.getBoundingClientRect().top)
        const line = out.find((l) => Math.abs(l.top - top) < 4)
        if (line) line.text += text[i]
        else out.push({ top, text: text[i] })
      }
    }
    return out.map((l) => l.text.replace(/\s+/g, ' ').trim())
  })
  // It wraps in the popover's width (else this test checks nothing).
  expect(lines.length).toBe(2)
  for (const line of lines) {
    expect(line, 'a line ends on the dash').not.toMatch(/-$/)
    expect(line, 'a line starts with the dash').not.toMatch(/^-/)
  }
  expect(lines.at(-1)).toBe('DNA - today · 9:00')
})

test('Find another time offers other free slots this week, and picking one moves the block', async ({ mount, page, simulator }) => {
  // Wed 28 Oct, 09:00.
  await freezeAt(page, simulator, addDays(FROZEN_MONDAY, 2), 9)
  seedWeek(simulator, FROZEN_MONDAY)
  await mount(<CalendarHarness />)
  const day = (d: number, h: number, m = 0) => new Date(2026, 9, 26 + d, h, m).toISOString()
  await block(page, 'Revise respiration').click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByRole('button', { name: 'Find another time' }).click()
  const slots = popover.getByTestId('another-time-slot')
  await expect(slots).toHaveCount(3)
  // Earliest first, never where it is now (Wed 16:00).
  await expect(slots.first()).toHaveText('Today 09:00')
  await expect(slots.filter({ hasText: 'Today 16:00' })).toHaveCount(0)
  // The fields stay for an exact time.
  await expect(popover.getByLabel('Start time')).toBeVisible()

  await slots.first().click()
  await expect(popover).toHaveCount(0)
  expect(simulator.db.planItems.find((p) => p.id === 'revise')).toMatchObject({ starts_at: day(2, 9), ends_at: day(2, 10), duration_min: 60 })
  await expect(block(page, 'Revise respiration')).toHaveAttribute('aria-label', /09:00 - 10:00/)
})

test('Find another time says so when nothing else fits before it is due', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, addDays(FROZEN_MONDAY, 2), 9)
  seed(simulator, [
    { id: 'busy', kind: 'commitment', title: 'Placement', starts_at: new Date(2026, 9, 28, 9).toISOString(), ends_at: new Date(2026, 9, 28, 14).toISOString() },
    { id: 'notes', kind: 'task', title: 'Tidy notes', starts_at: new Date(2026, 9, 28, 14).toISOString(), ends_at: new Date(2026, 9, 28, 15).toISOString(), duration_min: 60, due_at: new Date(2026, 9, 28, 15).toISOString() },
  ])
  await mount(<CalendarHarness />)
  await block(page, 'Tidy notes').click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByRole('button', { name: 'Find another time' }).click()
  await expect(popover.getByTestId('another-time')).toHaveText('No other free time fits before it is due this week.')
  await expect(popover.getByTestId('another-time-slot')).toHaveCount(0)
})

/** A 3h lab report booked in two sessions this week (Wed 14:00, Thu 10:00), the first already ticked. */
function seedSessions(simulator: BackendSimulator) {
  const day = (d: number, h: number) => new Date(2026, 9, 26 + d, h).toISOString()
  seed(simulator, [
    { id: 'lab', kind: 'task', title: 'Lab report write-up', duration_min: 180, due_at: day(4, 17), course: 'chemistry' },
    { id: 'lab-1', kind: 'task', title: 'Lab report write-up', starts_at: day(2, 14), ends_at: day(2, 15), duration_min: 60, source_type: 'plan_item', source_id: 'lab', status: 'done', course: 'chemistry' },
    { id: 'lab-2', kind: 'task', title: 'Lab report write-up', starts_at: day(3, 10), ends_at: day(3, 12), duration_min: 120, source_type: 'plan_item', source_id: 'lab', course: 'chemistry' },
  ])
}

test("ticking a to-do's last open session offers to tick the to-do off too", async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, addDays(FROZEN_MONDAY, 3), 13)
  seedSessions(simulator)
  await mount(<CalendarHarness />)
  await block(page, 'Lab report write-up').last().click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByRole('button', { name: 'Mark done' }).click()
  const offer = popover.getByTestId('tick-todo-too')
  await expect(offer).toHaveText(/That was its last session\. Tick off Lab report write-up too\?/)
  // Only the session is ticked until the student says so.
  expect(simulator.db.planItems.find((p) => p.id === 'lab-2')?.status).toBe('done')
  expect(simulator.db.planItems.find((p) => p.id === 'lab')?.status).toBe('open')
  await expect(offer.getByRole('button', { name: 'Tick it off' })).toBeFocused()
  await offer.getByRole('button', { name: 'Tick it off' }).click()
  await expect(popover).toHaveCount(0)
  expect(simulator.db.planItems.find((p) => p.id === 'lab')?.status).toBe('done')
})

test('"Not yet" leaves the to-do open; a session that is not the last one just ticks', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, addDays(FROZEN_MONDAY, 3), 13)
  seedSessions(simulator)
  simulator.db.planItems.find((p) => p.id === 'lab-1')!.status = 'open'
  await mount(<CalendarHarness />)
  const popover = page.getByTestId('calendar-popover')
  await block(page, 'Lab report write-up').first().click()
  await popover.getByRole('button', { name: 'Mark done' }).click()
  await expect(popover).toHaveCount(0)
  expect(simulator.db.planItems.find((p) => p.id === 'lab-1')?.status).toBe('done')

  await block(page, 'Lab report write-up').last().click()
  await popover.getByRole('button', { name: 'Mark done' }).click()
  await popover.getByTestId('tick-todo-too').getByRole('button', { name: 'Not yet' }).click()
  await expect(popover).toHaveCount(0)
  expect(simulator.db.planItems.find((p) => p.id === 'lab')?.status).toBe('open')
})

test('Find another time on a block past its due time offers this week\'s free slots and says why', async ({ mount, page, simulator }) => {
  // Wed 28 Oct, 09:00; due Tue 27 Oct 17:00, booked Thu 14:00.
  await freezeAt(page, simulator, addDays(FROZEN_MONDAY, 2), 9)
  seed(simulator, [
    { id: 'late', kind: 'task', title: 'Late essay plan', duration_min: 60, due_at: new Date(2026, 9, 27, 17).toISOString(), starts_at: new Date(2026, 9, 29, 14).toISOString(), ends_at: new Date(2026, 9, 29, 15).toISOString() },
  ])
  await mount(<CalendarHarness />)
  await block(page, 'Late essay plan').click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByRole('button', { name: 'Find another time' }).click()
  await expect(popover.getByTestId('another-time-overdue')).toHaveText("It's past its due time. These are this week's free slots.")
  await expect(popover.getByTestId('another-time-slot')).toHaveCount(3)
  // Its due time has passed, so the slots run to the week's end, not stop at it.
  await expect(popover.getByTestId('another-time-slot').first()).toHaveText('Today 09:00')
})

test('Find another time on a block with no due date never mentions one', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, addDays(FROZEN_MONDAY, 6), 21)
  seed(simulator, [
    { id: 'busy', kind: 'commitment', title: 'Night shift', starts_at: new Date(2026, 10, 1, 21, 30).toISOString(), ends_at: new Date(2026, 10, 1, 22).toISOString() },
    { id: 'notes', kind: 'task', title: 'Tidy notes', duration_min: null, starts_at: new Date(2026, 10, 1, 21).toISOString(), ends_at: new Date(2026, 10, 1, 21, 30).toISOString() },
  ])
  await mount(<CalendarHarness />)
  await block(page, 'Tidy notes').click()
  const popover = page.getByTestId('calendar-popover')
  await popover.getByRole('button', { name: 'Find another time' }).click()
  await expect(popover.getByTestId('another-time')).toContainText('No other free time fits this week.')
  await expect(popover.getByTestId('another-time')).not.toContainText('due')
})
