import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import type { Lecture } from '../packages/substrate/src'
import { classLectureTitle } from '../packages/substrate/src/class-occurrences'
import { startOfLocalDay } from '../packages/scheduler/src'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
import { apiUrl } from './ports'
import { reseed } from './reseed'
import { SEED_TIME_ZONE } from './seed-week'

/**
 * Opening a class on the calendar focuses its lecture, with its course, on
 * the board in view (03, decisions.md): no navigation, no new board. The
 * popover names the lecture (Undo puts the board back) and lists "Also open
 * in" for the student's other boards that can show a lecture, found by what
 * they contain; with none, a quiet "Add a widget".
 *
 * Clock-independent: each test makes its own one-off class, today or a week
 * from today at 07:00 London (always in the week, or the next week, the
 * calendar opens on), so the seeded week's classes never decide anything.
 */

const DAY_MS = 24 * 60 * 60_000

async function board(request: APIRequestContext, name: string, lensTypes: string[], courseTag?: string): Promise<string> {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name, courseTag })
  let x = 24
  for (const lensType of lensTypes) {
    const width = lensType === 'calendar' ? 900 : 420
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType, slotName: lensType, pos_x: x, pos_y: 24, width, height: 640 })
    x += width + 24
  }
  return ws.id
}

/** A one-off Genetics class (Biology), 07:00-08:00 London, `weeks` weeks from today. */
async function geneticsClass(request: APIRequestContext, weeks = 0) {
  const start = startOfLocalDay(Date.now(), SEED_TIME_ZONE) + weeks * 7 * DAY_MS + 7 * 60 * 60_000
  const item = await trpcMutation<{ id: string }>(request, 'planItems.create', {
    kind: 'commitment', title: 'Genetics lecture', subtype: 'class', course: 'biology',
    starts_at: new Date(start).toISOString(), ends_at: new Date(start + 60 * 60_000).toISOString(),
    timeZone: SEED_TIME_ZONE,
  })
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: SEED_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(start)
  return { id: item.id, date, title: classLectureTitle('Genetics lecture', date) }
}

/** A one-off Organic chemistry class (Chemistry), 09:00-10:00 London today. */
async function organicClass(request: APIRequestContext) {
  const start = startOfLocalDay(Date.now(), SEED_TIME_ZONE) + 9 * 60 * 60_000
  await trpcMutation(request, 'planItems.create', {
    kind: 'commitment', title: 'Organic chemistry', subtype: 'class', course: 'chemistry',
    starts_at: new Date(start).toISOString(), ends_at: new Date(start + 60 * 60_000).toISOString(),
    timeZone: SEED_TIME_ZONE,
  })
}

async function boardScope(request: APIRequestContext, workspaceId: string) {
  const rows = await trpcQuery<{ scope_type: string; scope_value: string }[]>(request, 'workspaces.scopes', workspaceId)
  return {
    course: rows.find((r) => r.scope_type === 'tag')?.scope_value ?? null,
    lecture: rows.find((r) => r.scope_type === 'lecture')?.scope_value ?? null,
  }
}

async function lecturesOf(request: APIRequestContext, classId: string) {
  return (await trpcQuery<Lecture[]>(request, 'lectures.list', {})).filter((l) => l.class_item_id === classId)
}

/** The seeded boards that can show a lecture (In Lecture and Evening Review have a Transcript). */
async function deleteLectureBoards(request: APIRequestContext) {
  for (const id of ['ws-in-lecture', 'ws-evening-review']) await trpcMutation(request, 'workspaces.delete', id)
}

async function openBoard(page: Page, name: string) {
  await page.goto('/')
  const topBar = new TopBarPom(page)
  await topBar.switchToWorkspace(name)
  await topBar.expectActiveWorkspace(name)
  return topBar
}

test.describe('A calendar class focuses its lecture', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('on a planning board: course and lecture focus here, the widgets follow, Undo puts it back', async ({ page, request }) => {
    await deleteLectureBoards(request)
    const plan = await board(request, 'Plan', ['calendar', 'todo'], 'chemistry')
    const cls = await geneticsClass(request)
    const topBar = await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)
    const todo = new PanelGridPom(page).panelByLabel('To-do')
    const block = calendar.block('Genetics lecture')
    await expect(topBar.scopeChip).toHaveText('Showing: Chemistry')
    await expect(todo.getByText('Chemistry problem sheet')).toBeVisible()
    await expect(todo.getByText('Plan the Biology essay')).toHaveCount(0)
    await expect(block).not.toHaveAttribute('data-linked')

    await block.click()
    const section = calendar.popover.getByTestId('class-lecture')
    await expect(section.getByRole('status')).toContainText(cls.title)
    // The board now shows the class's lecture, with its course.
    const [lecture] = await lecturesOf(request, cls.id)
    expect(lecture).toMatchObject({ title: cls.title, course: 'biology', class_date: cls.date })
    expect(await boardScope(request, plan)).toEqual({ course: 'biology', lecture: lecture.id })
    await expect(topBar.scopeChip).toHaveText(`Showing: Biology · ${cls.title}`)
    await expect(block).toHaveAttribute('data-linked', 'true')
    await expect(todo.getByText('Plan the Biology essay')).toBeVisible()
    await expect(todo.getByText('Chemistry problem sheet')).toHaveCount(0)
    // No other board can show a lecture: a quiet way to add a widget here, never a new board.
    await expect(section.getByRole('group', { name: 'Also open in' })).toHaveCount(0)
    await expect(section.getByTestId('class-lecture-hint')).toContainText('Transcript')
    await expect(section).not.toContainText(/board/i)

    await section.getByRole('button', { name: 'Undo' }).click()
    await expect(section.getByText('Undone')).toBeVisible()
    await expect(topBar.scopeChip).toHaveText('Showing: Chemistry')
    expect(await boardScope(request, plan)).toEqual({ course: 'chemistry', lecture: null })
    await expect(todo.getByText('Chemistry problem sheet')).toBeVisible()
    await expect(block).not.toHaveAttribute('data-linked')

    // "Add a widget" opens the board menu's palette.
    await section.getByRole('button', { name: 'Add a widget' }).click()
    await expect(calendar.popover).toHaveCount(0)
    await expect(page.getByTestId('widget-palette')).toBeVisible()
  })

  test('Also open in: lists the boards that can show a lecture by name, and opens the lecture there with a way back', async ({ page, request }) => {
    await board(request, 'Plan', ['calendar', 'todo'], 'chemistry')
    const cls = await geneticsClass(request)
    const topBar = await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)

    await calendar.block('Genetics lecture').click()
    const section = calendar.popover.getByTestId('class-lecture')
    await expect(section.getByRole('status')).toContainText(cls.title)
    const also = section.getByRole('group', { name: 'Also open in' })
    // In tab order (the reseeded boards start with Evening Review); Exam Prep
    // and Plan itself are left out.
    await expect(topBar.workspaceTabs).toHaveText(['Evening Review', 'Exam Prep', 'In Lecture', 'Plan'])
    await expect(also.getByRole('button')).toHaveText(['Evening Review', 'In Lecture'])
    await expect(section.getByTestId('class-lecture-hint')).toHaveCount(0)

    await also.getByRole('button', { name: 'In Lecture' }).click()
    await topBar.expectActiveWorkspace('In Lecture')
    const [lecture] = await lecturesOf(request, cls.id)
    expect(await boardScope(request, 'ws-in-lecture')).toEqual({ course: 'biology', lecture: lecture.id })
    await expect(topBar.scopeChip).toHaveText(`Showing: Biology · ${cls.title}`)
    const grid = new PanelGridPom(page)
    await expect(grid.panelByLabel('Audio Capture')).toContainText(`Ready to record ${cls.title}`)
    await expect(grid.panelByLabel('Transcript')).toContainText('No recording yet')
    const toast = page.getByTestId('toast-host')
    await expect(toast).toContainText(`Opened ${cls.title} in In Lecture`)

    await toast.getByRole('button', { name: 'Back to Plan' }).click()
    await topBar.expectActiveWorkspace('Plan')
    // Going back leaves both boards showing the lecture.
    await expect(topBar.scopeChip).toHaveText(`Showing: Biology · ${cls.title}`)
  })

  test('boards are found by what they contain, not their names', async ({ page, request }) => {
    await deleteLectureBoards(request)
    await board(request, 'Plan', ['calendar'])
    const bio = await board(request, 'Biology stuff', ['audio-capture', 'todo'])
    await board(request, 'In Lecture', ['coming-up'])
    await geneticsClass(request)
    await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)

    await calendar.block('Genetics lecture').click()
    const also = calendar.popover.getByRole('group', { name: 'Also open in' })
    await expect(also.getByRole('button')).toHaveText(['Biology stuff'])

    // Without its Record, "Biology stuff" can't show a lecture: the list goes.
    await page.keyboard.press('Escape')
    const panels = await trpcQuery<{ id: string; lens_type: string }[]>(request, 'workspaces.panels', bio)
    await trpcMutation(request, 'workspaces.removePanel', panels.find((p) => p.lens_type === 'audio-capture')!.id)
    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Plan')
    await calendar.block('Genetics lecture').click()
    await expect(calendar.popover.getByTestId('class-lecture').getByRole('status')).toContainText('Genetics lecture')
    await expect(also).toHaveCount(0)
    await expect(calendar.popover.getByTestId('class-lecture-hint')).toBeVisible()
  })

  test('the same class opened on two boards is one lecture; reopened, nothing changes and there is no Undo', async ({ page, request }) => {
    await board(request, 'Plan', ['calendar'])
    await board(request, 'Plan two', ['calendar'])
    const cls = await geneticsClass(request)
    const topBar = await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)
    const section = calendar.popover.getByTestId('class-lecture')

    await calendar.block('Genetics lecture').click()
    await expect(section.getByRole('button', { name: 'Undo' })).toBeVisible()
    await page.keyboard.press('Escape')
    await calendar.block('Genetics lecture').click()
    await expect(section.getByRole('status')).toContainText(cls.title)
    await expect(section.getByRole('button', { name: 'Undo' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await topBar.switchToWorkspace('Plan two')
    await calendar.block('Genetics lecture').click()
    await expect(section.getByRole('status')).toContainText(cls.title)
    expect(await lecturesOf(request, cls.id)).toHaveLength(1)
  })

  test('a recorded class says how much is recorded, and its Transcript shows the recording', async ({ page, request }) => {
    await deleteLectureBoards(request)
    await board(request, 'Plan', ['calendar', 'transcript'])
    const cls = await geneticsClass(request)
    // Its lecture, with a 52-minute recording.
    const { lecture } = await trpcMutation<{ lecture: Lecture }>(request, 'lectures.forClassOccurrence', { planItemId: cls.id, date: cls.date })
    const upload = await request.post(`${apiUrl}/upload`, {
      headers: {
        'content-type': 'audio/wav', 'x-user-id': 'dev-user-1', 'x-recording-title': 'Genetics part one',
        'x-lecture-id': lecture.id, 'x-recording-duration': String(52 * 60_000),
      },
      data: readFileSync(path.join(__dirname, 'fixtures', 'lecture-tone.wav')),
    })
    expect(upload.ok(), await upload.text()).toBe(true)
    await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)
    // The lecture's own read is slow: the focus answer already says it is recorded.
    await page.route('**/lectures.byId**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await route.fallback()
    })

    await calendar.block('Genetics lecture').click()
    const status = calendar.popover.getByTestId('class-lecture').getByRole('status')
    await expect(status).toContainText(cls.title)
    await expect(status).toContainText(`${cls.title}Recorded · 52 min`, { timeout: 1000 })
    const transcript = new PanelGridPom(page).panelByLabel('Transcript')
    await expect(transcript).toContainText(cls.title)
    await expect(transcript).toContainText(/\d+ segments/, { timeout: 15000 })
  })

  test('Undo keeps a change made elsewhere while the popover was open, and says the board has changed', async ({ page, request }) => {
    const plan = await board(request, 'Plan', ['calendar', 'todo'], 'chemistry')
    await geneticsClass(request)
    await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)
    await calendar.block('Genetics lecture').click()
    const section = calendar.popover.getByTestId('class-lecture')
    const undo = section.getByRole('button', { name: 'Undo' })
    await expect(undo).toBeVisible()

    // Another tab moves the board to all courses meanwhile.
    await trpcMutation(request, 'workspaces.setBoardScope', { workspaceId: plan, courseTag: null })
    await undo.click()
    await expect(section.getByRole('status')).toContainText('The board has changed since.')
    await expect(undo).toHaveCount(0)
    expect(await boardScope(request, plan)).toEqual({ course: null, lecture: null })
  })

  test('two quick opens: Undo puts back the board from before the first, not the class passed through', async ({ page, request }) => {
    const plan = await board(request, 'Plan', ['calendar'], 'chemistry')
    await geneticsClass(request)
    await organicClass(request)
    let first = true
    await page.route('**/lectures.forClassOccurrence**', async (route) => {
      if (first) {
        first = false
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
      await route.fallback()
    })
    await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)
    await calendar.block('Genetics lecture').click()
    await calendar.block('Organic chemistry').click()
    const section = calendar.popover.getByTestId('class-lecture')
    await expect(section.getByRole('status')).toContainText('Organic chemistry')
    await expect.poll(async () => (await boardScope(request, plan)).lecture).not.toBeNull()
    await section.getByRole('button', { name: 'Undo' }).click()
    await expect(section.getByText('Undone')).toBeVisible()
    expect(await boardScope(request, plan)).toEqual({ course: 'chemistry', lecture: null })
  })

  test("next week's class: its lecture is made now, upcoming, and Record names its date", async ({ page, request }) => {
    await board(request, 'Plan', ['calendar'])
    const cls = await geneticsClass(request, 1)
    const topBar = await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)
    await calendar.nextWeek()

    await calendar.block('Genetics lecture').click()
    const section = calendar.popover.getByTestId('class-lecture')
    await expect(section.getByRole('status')).toContainText(`${cls.title}Upcoming`)
    await section.getByRole('group', { name: 'Also open in' }).getByRole('button', { name: 'In Lecture' }).click()
    await topBar.expectActiveWorkspace('In Lecture')
    await expect(new PanelGridPom(page).panelByLabel('Audio Capture')).toContainText(`Ready to record ${cls.title}`)
  })

  test('keyboard: Enter on a class focuses its lecture; Enter on a board in "Also open in" switches and focus lands there', async ({ page, request }) => {
    await board(request, 'Plan', ['calendar'])
    const cls = await geneticsClass(request)
    const topBar = await openBoard(page, 'Plan')
    const calendar = new CalendarPom(page)
    const block = calendar.block('Genetics lecture')
    await expect(block).toBeVisible()

    await calendar.root.getByRole('button', { name: 'Add to calendar' }).focus()
    for (let i = 0; i < 40 && !(await block.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(block).toBeFocused()
    await page.keyboard.press('Enter')
    const section = calendar.popover.getByTestId('class-lecture')
    await expect(section.getByRole('status')).toContainText(cls.title)
    const target = section.getByRole('button', { name: 'In Lecture' })
    for (let i = 0; i < 20 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
    await page.keyboard.press('Enter')
    await topBar.expectActiveWorkspace('In Lecture')
    await expect(topBar.workspaceTab('In Lecture')).toBeFocused()
  })
})

test.describe('A calendar class on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true })
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a tap opens the popover and focuses the lecture, pressing nothing in it; a second tap on a board switches', async ({ page, request }) => {
    const plan = await board(request, 'Plan', ['calendar'], 'chemistry')
    const cls = await geneticsClass(request)
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Plan')
    await page.evaluate(() => {
      const w = window as unknown as { pressed: string[] }
      w.pressed = []
      for (const type of ['mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, (e) => {
          if ((e.target as Element).closest?.('[data-calendar-popover]')) w.pressed.push(type)
        }, true)
      }
    })
    const calendar = new CalendarPom(page)
    const block = calendar.block('Genetics lecture')
    await block.scrollIntoViewIfNeeded()
    const box = (await block.boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(10, box.height / 2))

    const section = calendar.popover.getByTestId('class-lecture')
    await expect(section.getByRole('status')).toContainText(cls.title)
    expect(await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return (window as unknown as { pressed: string[] }).pressed
    })).toEqual([])
    // Focused, not undone, and still on this board.
    await topBar.expectActiveWorkspace('Plan')
    await expect(section.getByRole('button', { name: 'Undo' })).toBeVisible()
    expect((await boardScope(request, plan)).course).toBe('biology')

    const target = section.getByRole('button', { name: 'In Lecture' })
    const rect = (await target.boundingBox())!
    expect(rect.height).toBeGreaterThanOrEqual(44)
    await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await topBar.expectActiveWorkspace('In Lecture')
    const [lecture] = await lecturesOf(request, cls.id)
    expect(await boardScope(request, 'ws-in-lecture')).toEqual({ course: 'biology', lecture: lecture.id })
  })
  for (const outcome of ['answered', 'failed'] as const) {
    test(`pending -> ${outcome}: no button in the popover moves`, async ({ page, request }) => {
      await board(request, 'Plan', ['calendar'], 'chemistry')
      await geneticsClass(request)
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => { release = resolve })
      await page.route('**/lectures.forClassOccurrence**', async (route) => {
        await held
        await (outcome === 'answered' ? route.fallback() : route.abort())
      })
      await page.goto('/')
      await new TopBarPom(page).switchToWorkspace('Plan')
      const calendar = new CalendarPom(page)
      const block = calendar.block('Genetics lecture')
      await block.scrollIntoViewIfNeeded()
      const box = (await block.boundingBox())!
      await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(10, box.height / 2))
      const section = calendar.popover.getByTestId('class-lecture')
      await expect(section.getByText('Finding this lecture...')).toBeVisible()
      const boxes = async () => ({
        board: await section.getByRole('button', { name: 'In Lecture' }).boundingBox(),
        save: await calendar.popover.getByRole('button', { name: 'Save' }).boundingBox(),
      })
      const before = await boxes()

      release()
      await expect(section.getByRole('button', { name: outcome === 'answered' ? 'Undo' : 'Try again' })).toBeVisible()
      expect(await boxes()).toEqual(before)
    })
  }
})
