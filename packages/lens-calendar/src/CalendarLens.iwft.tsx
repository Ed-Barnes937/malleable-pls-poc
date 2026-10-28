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

test('block language: a class is a solid course tint, a shift neutral with a cup, study time a soft tint with a bar and a grab handle', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  await mount(<CalendarHarness />)

  const lecture = block(page, 'Biology lecture')
  await expect(lecture).toHaveAttribute('data-look', 'class')
  await expect(lecture).toHaveClass(/bg-course-biology-tint/)
  await expect(lecture.getByTestId('calendar-grip')).toHaveCount(0)

  const shift = block(page, 'Cafe shift')
  await expect(shift).toHaveAttribute('data-look', 'shift')
  await expect(shift).toHaveClass(/bg-shift/)
  await expect(shift.getByTestId('calendar-shift-icon')).toBeVisible()
  await expect(shift.getByTestId('calendar-grip')).toHaveCount(0)

  const study = block(page, 'Revise respiration')
  await expect(study).toHaveAttribute('data-look', 'study')
  await expect(study).toHaveClass(/bg-course-biology-soft/)
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

test('a 20-minute block keeps a legible title and its time in the tooltip', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seed(simulator, [{ id: 'short', kind: 'task', title: 'Quick review', starts_at: iso(4, 19), ends_at: iso(4, 19, 20), duration_min: 20 }])
  await mount(<CalendarHarness />)
  const short = block(page, 'Quick review')
  await expect(short).toHaveAttribute('title', /19:00 - 19:20/)
  const title = short.getByTestId('calendar-block-title')
  await expect(title).toHaveText('Quick review')
  await expect(title).toBeVisible()
  // One whole line of 12px text, not cut by the short box.
  expect(await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
  expect((await title.boundingBox())!.height).toBeGreaterThanOrEqual(12)
  expect(await short.evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible')
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
  const heightOf = async (title: string) => (await block(page, title).boundingBox())!.height
  const hourPx = (await heightOf('Review hour')) + 2
  // The default zoom fits 08:00-22:00, so short blocks are small: they still differ.
  expect(await heightOf('Review twenty')).toBeCloseTo(hourPx / 3 - 2, 0)
  expect(await heightOf('Review thirty')).toBeCloseTo(hourPx / 2 - 2, 0)
  expect((await heightOf('Review thirty')) - (await heightOf('Review twenty'))).toBeGreaterThanOrEqual(4)
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
