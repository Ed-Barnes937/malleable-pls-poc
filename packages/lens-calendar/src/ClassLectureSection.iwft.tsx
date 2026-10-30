import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { ClassFocusHarness } from '../../../playwright/class-focus-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import { seedPlanItem } from '../../../playwright/plan-items'

/**
 * Opening a class block focuses its occurrence's lecture on the board (03):
 * the Calendar asks with the occurrence's date, the shell's `useFocusClass`
 * finds or makes the lecture and selects it (here against the simulator),
 * and the popover's Lecture row says what happened, with Undo, "Also open
 * in" and, when no board can show a lecture, "Add a widget".
 *
 * The clock is frozen in the week of Mon 26 Oct 2026 (London), so past, on
 * now and upcoming don't depend on when the suite runs.
 */

const BOARD = 'ws-exam-prep'
const tz = 'Europe/London'
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 26 + day, h, m)
const iso = (day: number, h: number, m = 0) => at(day, h, m).toISOString()

async function freezeAt(page: Page, simulator: BackendSimulator, now: Date) {
  await page.clock.setFixedTime(now)
  simulator.freezeNow(now)
}

/** Mondays 10:00-11:00 from 19 Oct, Biology; a shift, a task, a deadline and a study block from a moment, on other days. */
function seedWeek(simulator: BackendSimulator) {
  seedPlanItem(simulator, {
    id: 'bio-class', kind: 'commitment', subtype: 'class', title: 'Biology lecture', course: 'biology',
    starts_at: iso(-7, 10), ends_at: iso(-7, 11), recurrence: { freq: 'weekly', timeZone: tz },
  })
  seedPlanItem(simulator, { id: 'shift', kind: 'commitment', subtype: 'shift', title: 'Cafe shift', starts_at: iso(1, 18), ends_at: iso(1, 21) })
  seedPlanItem(simulator, { id: 'essay', kind: 'task', title: 'Essay plan', course: 'biology', starts_at: iso(2, 14), ends_at: iso(2, 15), duration_min: 60 })
  seedPlanItem(simulator, { id: 'quiz', kind: 'deadline', title: 'Biology quiz', course: 'biology', due_at: iso(3, 9) })
  seedPlanItem(simulator, {
    id: 'review', kind: 'task', title: 'Review: maternal inheritance', course: 'biology',
    starts_at: iso(4, 16), ends_at: iso(4, 16, 30), duration_min: 30,
    source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000,
  })
  // The board shows Chemistry to start with.
  simulator.db.workspaceScopes.push({ id: 'scope-chem', workspace_id: BOARD, scope_type: 'tag', scope_value: 'chemistry' })
}

const block = (page: Page, title: string) => page.getByTestId('calendar-block').filter({ hasText: title })
const section = (page: Page) => page.getByTestId('calendar-popover').getByTestId('class-lecture')
const calls = (page: Page) => page.getByTestId('class-calls').getByRole('listitem')
const BIO_TITLE = 'Biology lecture · Mon 26 Oct'

test('opening a class focuses its lecture and course on the board; Undo puts back what it showed', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, at(2, 12))
  seedWeek(simulator)
  await mount(<ClassFocusHarness />)
  await expect(page.getByTestId('board-scope')).toHaveText('chemistry / no lecture')

  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toHaveText(`Showing ${BIO_TITLE}No recording yet`)
  await expect(calls(page)).toHaveText(['focus bio-class@2026-10-26'])
  const lecture = simulator.db.lectures.find((l) => l.class_item_id === 'bio-class')!
  expect(lecture).toMatchObject({ title: BIO_TITLE, course: 'biology', class_date: '2026-10-26' })
  await expect(page.getByTestId('board-scope')).toHaveText(`biology / ${lecture.id}`)
  // The Calendar rings the occurrence it now shows, and keeps every course.
  await expect(block(page, 'Biology lecture')).toHaveAttribute('data-linked', 'true')
  await expect(block(page, 'Cafe shift')).toBeVisible()

  await section(page).getByRole('button', { name: 'Undo' }).click()
  await expect(section(page).getByText('Undone')).toBeVisible()
  await expect(section(page).getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await expect(page.getByTestId('board-scope')).toHaveText('chemistry / no lecture')
  await expect(block(page, 'Biology lecture')).not.toHaveAttribute('data-linked')

  // Opened again: the same lecture (no second one), and Undo only for a change.
  await page.keyboard.press('Escape')
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('button', { name: 'Undo' })).toBeVisible()
  await page.keyboard.press('Escape')
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toContainText(BIO_TITLE)
  await expect(section(page).getByRole('button', { name: 'Undo' })).toHaveCount(0)
  expect(simulator.db.lectures.filter((l) => l.class_item_id === 'bio-class')).toHaveLength(1)
})

test('the lecture row says where the class is: on now, upcoming, past, or recorded', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  // 09:50 on Monday: within 15 minutes of the start counts as on.
  await freezeAt(page, simulator, at(0, 9, 50))
  await mount(<ClassFocusHarness />)
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toHaveText(`Showing ${BIO_TITLE}On now`)
  await page.keyboard.press('Escape')

  // Next Monday's, from this week: upcoming, and its lecture is made now.
  await page.getByRole('button', { name: 'Next week' }).click()
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toHaveText('Showing Biology lecture · Mon 2 NovUpcoming')
  await expect(calls(page)).toHaveText(['focus bio-class@2026-10-26', 'focus bio-class@2026-11-02'])
  await page.keyboard.press('Escape')

  // Last Monday's, never recorded.
  await page.getByRole('button', { name: 'Previous week' }).click()
  await page.getByRole('button', { name: 'Previous week' }).click()
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toHaveText('Showing Biology lecture · Mon 19 OctNo recording yet')
  await page.keyboard.press('Escape')

  // This Monday's lecture gets a 47-minute recording: the open row says so.
  await page.getByRole('button', { name: 'Next week' }).click()
  const lecture = simulator.db.lectures.find((l) => l.class_item_id === 'bio-class' && l.class_date === '2026-10-26')!
  simulator.db.recordings.find((r) => r.id === 'rec-bio-1')!.lecture_id = lecture.id
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toHaveText(`Showing ${BIO_TITLE}Recorded · 47 min`)
})

test('only class blocks focus a lecture: not a shift, a task, a deadline, a study block or a drag', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, at(2, 12))
  seedWeek(simulator)
  await mount(<ClassFocusHarness />)
  const popover = page.getByTestId('calendar-popover')
  for (const title of ['Cafe shift', 'Essay plan', 'Review: maternal inheritance']) {
    await block(page, title).click()
    await expect(popover).toBeVisible()
    await expect(popover.getByTestId('class-lecture')).toHaveCount(0)
    await page.keyboard.press('Escape')
  }
  await page.getByTestId('calendar-due').filter({ hasText: 'Biology quiz' }).click()
  await expect(popover).toBeVisible()
  await expect(popover.getByTestId('class-lecture')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // A press that drags off the class opens nothing.
  const box = (await block(page, 'Biology lecture').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + 120, { steps: 8 })
  await page.mouse.up()
  await expect(calls(page)).toHaveCount(0)
  await expect(page.getByTestId('board-scope')).toHaveText('chemistry / no lecture')
})

test('a focus that fails leaves the board alone and offers to try again; the rest of the popover still works', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, at(2, 12))
  seedWeek(simulator)
  let fail = true
  await page.route('**/lectures.forClassOccurrence**', (route) => (fail ? route.abort() : route.fallback()))
  await mount(<ClassFocusHarness />)

  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toHaveText("Couldn't show this lecture.")
  await expect(page.getByTestId('board-scope')).toHaveText('chemistry / no lecture')
  await expect(page.getByTestId('calendar-popover').getByRole('button', { name: 'Save' })).toBeEnabled()

  fail = false
  await section(page).getByRole('button', { name: 'Try again' }).click()
  await expect(section(page).getByRole('status')).toContainText(BIO_TITLE)
  await expect(page.getByTestId('board-scope')).toHaveText(/^biology \/ lec-/)
})

test('"Finding this lecture..." shows while it is found, and the popover neither remounts nor moves when the answer lands', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, at(2, 12))
  seedWeek(simulator)
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/lectures.forClassOccurrence**', async (route) => {
    await held
    await route.fallback()
  })
  await mount(<ClassFocusHarness lectureBoards={[{ id: 'ws-in-lecture', name: 'In Lecture' }]} />)

  await block(page, 'Biology lecture').click()
  const finding = section(page).getByText('Finding this lecture...')
  await expect(finding).toBeVisible()
  // Typed while it is being found: kept when the board's scope changes under the popover.
  const title = page.getByTestId('calendar-popover').getByLabel('Title')
  await title.fill('Biology lecture (room 2)')
  await page.getByTestId('calendar-popover').evaluate((el) => { (window as unknown as { popover: Element }).popover = el })
  const target = section(page).getByRole('button', { name: 'In Lecture' })
  await expect(target).toHaveAttribute('aria-disabled', 'true')
  const before = await target.boundingBox()

  release()
  await expect(section(page).getByRole('status')).toContainText(BIO_TITLE)
  await expect(page.getByTestId('board-scope')).toHaveText(/^biology \/ lec-/)
  await expect(title).toHaveValue('Biology lecture (room 2)')
  expect(await page.getByTestId('calendar-popover').evaluate((el) => el === (window as unknown as { popover: Element }).popover)).toBe(true)
  await expect(target).not.toHaveAttribute('aria-disabled')
  expect(await target.boundingBox()).toEqual(before)
})

test('"Also open in": hidden with no other board, each board by name, more than three behind "More boards..."', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, at(2, 12))
  seedWeek(simulator)
  const boards = [
    { id: 'ws-in-lecture', name: 'In Lecture' },
    { id: 'ws-evening-review', name: 'Evening Review' },
    { id: 'ws-bio', name: 'Bio review' },
    { id: 'ws-notes', name: 'Notes' },
  ]
  const component = await mount(<ClassFocusHarness boardShowsLectures />)
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toContainText(BIO_TITLE)
  await expect(section(page).getByRole('group', { name: 'Also open in' })).toHaveCount(0)
  // This board shows lectures: no "Add a widget" either.
  await expect(section(page).getByTestId('class-lecture-hint')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await component.update(<ClassFocusHarness boardShowsLectures lectureBoards={boards.slice(0, 3)} />)
  await block(page, 'Biology lecture').click()
  const also = section(page).getByRole('group', { name: 'Also open in' })
  await expect(also.getByRole('button')).toHaveText(['In Lecture', 'Evening Review', 'Bio review'])
  await page.keyboard.press('Escape')

  await component.update(<ClassFocusHarness boardShowsLectures lectureBoards={boards} />)
  await block(page, 'Biology lecture').click()
  await expect(also.getByRole('button')).toHaveText(['In Lecture', 'Evening Review', 'Bio review', 'More boards...'])
  await also.getByRole('button', { name: 'More boards...' }).click()
  await expect(also.getByRole('button')).toHaveText(['In Lecture', 'Evening Review', 'Bio review', 'Notes'])

  await also.getByRole('button', { name: 'Notes' }).click()
  await expect(calls(page)).toHaveText(['focus bio-class@2026-10-26', 'focus bio-class@2026-10-26', 'focus bio-class@2026-10-26', `open ws-notes: ${BIO_TITLE}`])
  // Opened there: this popover goes.
  await expect(page.getByTestId('calendar-popover')).toHaveCount(0)
})

test('"Also open in" that fails says so in place, and a board that is gone says that', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, at(2, 12))
  seedWeek(simulator)
  const boards = [{ id: 'ws-in-lecture', name: 'In Lecture' }]
  const component = await mount(<ClassFocusHarness lectureBoards={boards} openResult="failed" />)
  await block(page, 'Biology lecture').click()
  await expect(section(page).getByRole('status')).toContainText(BIO_TITLE)
  await section(page).getByRole('button', { name: 'In Lecture' }).click()
  await expect(section(page).getByRole('alert')).toHaveText("Couldn't open it there. Try again?")
  await page.keyboard.press('Escape')

  await component.update(<ClassFocusHarness lectureBoards={boards} openResult="gone" />)
  await block(page, 'Biology lecture').click()
  await section(page).getByRole('button', { name: 'In Lecture' }).click()
  await expect(section(page).getByRole('alert')).toHaveText('That board is gone.')
})

test('with no board that shows a lecture, a quiet "Add a widget" names the widgets that do', async ({ mount, page, simulator }) => {
  await freezeAt(page, simulator, at(2, 12))
  seedWeek(simulator)
  await mount(<ClassFocusHarness />)
  await block(page, 'Biology lecture').click()
  const hint = section(page).getByTestId('class-lecture-hint')
  // From the registered widgets' manifests (lectureId: 'target').
  await expect(hint).toHaveText('Audio Capture, Transcript and Connections show a lecture. Add a widget')
  await expect(section(page)).not.toContainText(/board/i)
  await hint.getByRole('button', { name: 'Add a widget' }).click()
  await expect(calls(page)).toHaveText(['focus bio-class@2026-10-26', 'add a widget'])
  await expect(page.getByTestId('calendar-popover')).toHaveCount(0)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 } })

  test('the lecture row and each board are full-width rows at least 44px tall, above the footer', async ({ mount, page, simulator }) => {
    await freezeAt(page, simulator, at(0, 8))
    seedWeek(simulator)
    await mount(<ClassFocusHarness width="100%" height={760} lectureBoards={[{ id: 'ws-in-lecture', name: 'In Lecture' }, { id: 'ws-evening-review', name: 'Evening Review' }]} />)
    await block(page, 'Biology lecture').click()
    await expect(section(page).getByRole('status')).toHaveText(`Showing ${BIO_TITLE}Upcoming`)
    const popover = (await page.getByTestId('calendar-popover').boundingBox())!
    const save = (await page.getByTestId('calendar-popover').getByRole('button', { name: 'Save' }).boundingBox())!
    for (const name of ['Undo', 'In Lecture', 'Evening Review']) {
      const box = (await section(page).getByRole('button', { name }).boundingBox())!
      expect(box.height, name).toBeGreaterThanOrEqual(44)
      expect(box.y + box.height, name).toBeLessThanOrEqual(save.y)
    }
    const row = (await section(page).getByRole('button', { name: 'In Lecture' }).boundingBox())!
    // Full width: the popover's width less its padding.
    expect(row.width).toBeGreaterThan(popover.width - 40)
  })
})
