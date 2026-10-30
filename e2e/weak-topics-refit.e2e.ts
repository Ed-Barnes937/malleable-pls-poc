import { test, expect, type APIRequestContext } from '@playwright/test'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { SEED_MISSED_IDS, weekMonday } from './seed-week'
import { trpcMutation, trpcQuery } from './api'

/**
 * Demo encores (plan ticket T10): weak topics read like topics and jump to
 * their lecture moment, the progress widgets count the same moments, and
 * study blocks that didn't happen are re-fit on request.
 */

interface Item { id: string; title: string; kind: string; starts_at: string | null; ends_at: string | null }

async function board(request: APIRequestContext, name: string, lensTypes: string[]) {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name })
  let x = 24
  for (const lensType of lensTypes) {
    const width = lensType === 'calendar' ? 900 : 440
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType, slotName: lensType, pos_x: x, pos_y: 24, width, height: 600 })
    x += width + 24
  }
  return ws.id
}

/** `days` from today at `hour`:00 local time. */
function daysFromNow(days: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

/**
 * The re-fit note for blocks moved to `starts`, as of now: "in your calendar"
 * when they stayed this week, else the week they went to (re-fit looks a
 * week ahead, so at most next week; the copy is unit-tested in
 * missed-blocks.test.tsx). Late on a Sunday, tomorrow is next week.
 * `showNextWeek`: the note's widget offers "Show next week" when blocks went
 * there (the To-do does, on a board with a Calendar to show it in).
 */
function movedNoteFor(starts: ReadonlyArray<string | null>, { showNextWeek }: { showNextWeek: boolean }): string {
  const week = (ms: number) => JSON.stringify(weekMonday(ms))
  const later = starts.filter((s) => week(Date.parse(s!)) !== week(Date.now())).length
  const n = starts.length
  const action = showNextWeek && later > 0 ? ' Show next week' : ''
  if (later === 0) return `Moved ${n} blocks. They're in your calendar.`
  if (later === n) return `Moved ${n} blocks to next week.${action}`
  return `Moved ${n} blocks: ${n - later} this week, ${later} next week.${action}`
}

test.describe('Weak topics', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('every progress widget counts the same moments to review', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Evening Review is a Biology board.
    await topBar.switchToWorkspace('Evening Review')
    const progress = grid.panelByLabel('Your Progress')
    await expect(progress.getByText('5 moments to review')).toBeVisible({ timeout: 10000 })
    await expect(progress.getByText('You feel sure about 7 of 54 moments so far')).toBeVisible()

    await topBar.switchToWorkspace('Exam Prep')
    const allCourses = grid.panelByLabel('All Courses')
    await expect(allCourses.locator('[data-course="biology"]')).toContainText('5 to review', { timeout: 10000 })
    await expect(allCourses.locator('[data-course="chemistry"]')).toContainText('1 to review')
    const weakest = grid.panelByLabel('Weakest Topics')
    await expect(weakest.getByText('6 to review')).toBeVisible()
    await expect(weakest.getByTestId('weak-topic')).toHaveCount(6)
  })

  test('topics read as topics with their lecture moment, never "Week 1"', async ({ page }) => {
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Exam Prep')
    const weakest = new PanelGridPom(page).panelByLabel('Weakest Topics')
    const maternal = weakest.getByTestId('weak-topic').filter({ hasText: 'Maternal inheritance' })
    await expect(maternal).toContainText('Mitochondrial DNA · 9:00', { timeout: 10000 })
    await expect(maternal).toContainText('25% sure')
    await expect(weakest.getByText('Week 1')).toHaveCount(0)
  })

  test('on a full board, the board scrolls to the Transcript showing the moment', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Full week' })
    // Calendar and To-do fill the view, Weakest Topics beside them, the Transcript below the fold.
    const panels = [
      { lensType: 'calendar', pos_x: 20, pos_y: 20, width: 900, height: 640 },
      { lensType: 'weakest-topics', pos_x: 940, pos_y: 20, width: 360, height: 600 },
      { lensType: 'todo', pos_x: 20, pos_y: 680, width: 420, height: 380 },
      { lensType: 'transcript', pos_x: 460, pos_y: 1100, width: 460, height: 420 },
    ]
    for (const p of panels) {
      await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, slotName: p.lensType, ...p })
    }
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Full week')
    const grid = new PanelGridPom(page)
    const transcript = grid.panelByLabel('Transcript')
    await expect(transcript).not.toBeInViewport()

    await grid.panelByLabel('Weakest Topics').getByRole('button', { name: /^Maternal inheritance: go to this moment/ }).click()

    const moment = transcript.locator('[data-moment]')
    await expect(moment).toContainText('inherited exclusively from the maternal line', { timeout: 10000 })
    await expect(transcript).toBeInViewport({ ratio: 0.9 })
    await expect(moment).toBeInViewport()
  })

  test('clicking a topic lands on its transcript moment on this board', async ({ page, request }) => {
    await board(request, 'Revision', ['weakest-topics', 'transcript'])
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Revision')
    const grid = new PanelGridPom(page)
    const transcript = grid.panelByLabel('Transcript')
    await expect(transcript.getByText('Pick a lecture to see its transcript')).toBeVisible()

    await grid.panelByLabel('Weakest Topics').getByRole('button', { name: /^Maternal inheritance: go to this moment/ }).click()

    const moment = transcript.locator('[data-moment]')
    await expect(moment).toContainText('inherited exclusively from the maternal line', { timeout: 10000 })
    await expect(moment).toBeInViewport()
    await expect(topBar.lecturePill).toHaveText('Biology Lecture: Mitochondrial DNA')
  })

  test("a topic from another lecture switches this board's lecture, says so and offers the way back", async ({ page, request }) => {
    const ws = await board(request, 'Revision', ['weakest-topics', 'transcript'])
    // The board shows another Biology lecture to start with.
    await trpcMutation(request, 'workspaces.setBoardScope', { workspaceId: ws, lectureId: 'lec-rec-bio-1' })
    const before = (await trpcQuery<{ title: string }>(request, 'recordings.byId', 'rec-bio-1')).title
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Revision')
    await expect(topBar.lecturePill).toHaveText(before, { timeout: 10000 })

    const grid = new PanelGridPom(page)
    await grid.panelByLabel('Weakest Topics').getByRole('button', { name: /^Maternal inheritance: go to this moment/ }).click()
    const moment = grid.panelByLabel('Transcript').locator('[data-moment]')
    await expect(moment).toContainText('inherited exclusively from the maternal line', { timeout: 10000 })
    await expect(topBar.lecturePill).toHaveText('Biology Lecture: Mitochondrial DNA')
    const toast = page.getByTestId('toast-host')
    await expect(toast).toContainText('Opened 9:00 in Biology Lecture: Mitochondrial DNA')
    await toast.getByRole('button', { name: `Back to ${before}` }).click()
    await expect(topBar.lecturePill).toHaveText(before)
  })

  test('from a board without a Transcript, it opens the moment on one that has it, with a way back', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Exam Prep')
    const weakest = new PanelGridPom(page).panelByLabel('Weakest Topics')

    await weakest.getByRole('button', { name: /^Maternal inheritance: go to this moment/ }).click()

    await topBar.expectActiveWorkspace('Evening Review')
    const moment = new PanelGridPom(page).panelByLabel('Transcript').locator('[data-moment]')
    await expect(moment).toContainText('inherited exclusively from the maternal line', { timeout: 10000 })
    await expect(moment).toBeInViewport()
    const toast = page.getByTestId('toast-host')
    await expect(toast).toContainText('Opened 9:00 in Evening Review')
    await toast.getByRole('button', { name: 'Back to Exam Prep' }).click()
    await topBar.expectActiveWorkspace('Exam Prep')
  })
})

test.describe('To-do source link', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a review to-do jumps to the exact lecture moment it came from', async ({ page, request }) => {
    await trpcMutation(request, 'planItems.create', {
      kind: 'task', title: 'Review: maternal inheritance', duration_min: 20, course: 'biology',
      source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000,
    })
    await board(request, 'Revision', ['todo', 'transcript'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('Revision')
    const grid = new PanelGridPom(page)

    await grid.panelByLabel('To-do').getByRole('button', { name: 'From Biology Lecture: Mitochondrial DNA · 9:00' }).click()
    const moment = grid.panelByLabel('Transcript').locator('[data-moment]')
    await expect(moment).toContainText('inherited exclusively from the maternal line', { timeout: 10000 })
    await expect(moment).toBeInViewport()
  })
})

test.describe('Re-fit blocks that did not happen', () => {
  test.beforeEach(async ({ request }) => {
    await reseed()
    // Each test makes its own missed blocks: set aside the seeded ones.
    for (const id of SEED_MISSED_IDS) await trpcMutation(request, 'planItems.delete', id)
  })
  test.afterAll(async () => { await reseed() })

  test('To-do asks calmly, previews new times and moves only the missed study blocks', async ({ page, request }) => {
    const readChapter = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Read chapter 5', duration_min: 30, starts_at: daysFromNow(-2, 10), ends_at: daysFromNow(-2, 11),
    })
    const labWriteUp = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Lab write-up', duration_min: 60, starts_at: daysFromNow(-1, 19), ends_at: daysFromNow(-1, 20), course: 'chemistry',
    })
    // Never re-fit: a class that has passed, and a block that was done.
    const shift = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'commitment', title: 'Cafe shift', subtype: 'shift', starts_at: daysFromNow(-1, 12), ends_at: daysFromNow(-1, 17),
    })
    const done = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Flashcards', duration_min: 20, starts_at: daysFromNow(-1, 9), ends_at: daysFromNow(-1, 10),
    })
    await trpcMutation(request, 'planItems.complete', { id: done.id })

    await board(request, 'My week', ['todo'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const todo = new PanelGridPom(page).panelByLabel('To-do')

    const banner = todo.getByTestId('refit-banner')
    await expect(banner).toContainText("2 blocks didn't happen. Re-fit them?", { timeout: 10000 })
    await expect(todo.getByText(/overdue/i)).toHaveCount(0)
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(banner.getByTestId('refit-proposal')).toHaveCount(2)
    await expect(banner.getByTestId('refit-proposal').first()).toContainText('Read chapter 5')
    await banner.getByRole('button', { name: 'Move them' }).click()

    await expect(todo.getByTestId('refit-banner')).toHaveCount(0)
    await expect(todo.getByText(/^Still to do from /)).toHaveCount(0)
    // The move is saved behind the optimistic UI: wait for it, don't read once.
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    const items = await trpcQuery<Item[]>(request, 'planItems.list', {})
    const byId = (id: string) => items.find((i) => i.id === id)!
    // A To-do-only board: no Calendar to show next week in.
    await expect(todo.getByTestId('refit-note')).toHaveText(movedNoteFor([readChapter, labWriteUp].map((t) => byId(t.id).starts_at), { showNextWeek: false }))

    for (const task of [readChapter, labWriteUp]) {
      expect(Date.parse(byId(task.id).starts_at!)).toBeGreaterThan(Date.now() - 5 * 60_000)
    }
    expect(Date.parse(byId(readChapter.id).ends_at!) - Date.parse(byId(readChapter.id).starts_at!)).toBe(30 * 60_000)
    expect(byId(shift.id).starts_at).toBe(shift.starts_at)
    expect(byId(done.id).starts_at).toBe(done.starts_at)
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
  })

  test('keep my plan leaves the missed blocks where they were', async ({ page, request }) => {
    const missed = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Read chapter 5', duration_min: 30, starts_at: daysFromNow(-1, 10), ends_at: daysFromNow(-1, 11),
    })
    await board(request, 'My week', ['todo'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const banner = new PanelGridPom(page).panelByLabel('To-do').getByTestId('refit-banner')

    await expect(banner).toContainText("1 block didn't happen. Re-fit it?", { timeout: 10000 })
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await banner.getByRole('button', { name: 'Keep my plan' }).click()
    await expect(banner).toHaveCount(0)
    const item = (await trpcQuery<Item[]>(request, 'planItems.list', { kinds: ['task'] })).find((i) => i.id === missed.id)!
    expect(item.starts_at).toBe(missed.starts_at)
  })

  /** Two study blocks that didn't happen, plus things re-fit never touches. */
  async function seedMissed(request: APIRequestContext) {
    const readChapter = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Read chapter 5', duration_min: 30, starts_at: daysFromNow(-2, 10), ends_at: daysFromNow(-2, 11),
    })
    const labWriteUp = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Lab write-up', duration_min: 60, starts_at: daysFromNow(-1, 19), ends_at: daysFromNow(-1, 20), course: 'chemistry',
    })
    // Busy all today, so the new times land tomorrow (one week, whatever the hour) around Priya's classes and shifts.
    await trpcMutation(request, 'planItems.create', {
      kind: 'commitment', title: 'Away today', starts_at: daysFromNow(0, 0), ends_at: daysFromNow(1, 0),
    })
    return [readChapter, labWriteUp]
  }

  test('blocks moved past this week: To-do says they went to next week and shows that week in the Calendar', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const missed = await seedMissed(request)
    // Away for the rest of this week, so their new times are next week (as from a Thursday on in the demo).
    const m = weekMonday(Date.now())
    const nextMonday = new Date(m.year, m.month - 1, m.day + 7).toISOString()
    await trpcMutation(request, 'planItems.create', { kind: 'commitment', title: 'Away this week', starts_at: daysFromNow(0, 0), ends_at: nextMonday })
    await board(request, 'My week', ['calendar', 'todo'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    const todo = new PanelGridPom(page).panelByLabel('To-do')
    const thisWeek = await calendar.root.getByTestId('calendar-title').textContent()

    const banner = todo.getByTestId('refit-banner')
    await expect(banner).toContainText("2 blocks didn't happen. Re-fit them?", { timeout: 10000 })
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(banner.getByTestId('refit-proposal')).toHaveCount(2)
    await banner.getByRole('button', { name: 'Move them' }).click()

    const note = todo.getByTestId('refit-note')
    await expect(note).toHaveText('Moved 2 blocks to next week. Show next week')
    // The move is saved behind the optimistic UI: wait for it, don't read once.
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    const items = await trpcQuery<Item[]>(request, 'planItems.list', {})
    const starts = missed.map((t) => Date.parse(items.find((i) => i.id === t.id)!.starts_at!))
    for (const start of starts) expect(start).toBeGreaterThanOrEqual(Date.parse(nextMonday))
    // The calendar still shows this week until asked.
    await expect(calendar.root.getByTestId('calendar-title')).toHaveText(thisWeek!)

    await note.getByRole('button', { name: 'Show next week' }).click()
    await expect(calendar.root.getByTestId('calendar-title')).not.toHaveText(thisWeek!)
    const first = missed[starts.indexOf(Math.min(...starts))]
    const block = calendar.block(first.title)
    await expect(block).toHaveAttribute('data-revealed', 'true')
    await expect(block).toBeInViewport()
    await expect(note).toHaveCount(0)
  })

  test('Calendar shows the new times as ghosts and accepting moves them, clear of every commitment', async ({ page, request }) => {
    const missed = await seedMissed(request)
    const before = await trpcQuery<Item[]>(request, 'planItems.list', {})
    await board(request, 'My week', ['calendar'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    const banner = calendar.root.getByTestId('refit-banner')
    const ghosts = calendar.root.getByTestId('calendar-ghost')

    await expect(banner).toContainText("2 blocks didn't happen. Re-fit them?", { timeout: 10000 })
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(ghosts).toHaveCount(2)
    await expect(ghosts.filter({ hasText: 'Read chapter 5' })).toBeVisible()
    // Nothing moves until accepted.
    expect(await trpcQuery<Item[]>(request, 'planItems.list', {})).toEqual(before)

    await banner.getByRole('button', { name: 'Move them' }).click()
    await expect(ghosts).toHaveCount(0)
    // The move is saved behind the optimistic UI: wait for it, don't read once.
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    const moved = await trpcQuery<Item[]>(request, 'planItems.list', {})
    // The Calendar's own note has no action: it opens the week they went to itself.
    await expect(calendar.root.getByTestId('refit-note')).toHaveText(movedNoteFor(missed.map((t) => moved.find((i) => i.id === t.id)!.starts_at), { showNextWeek: false }))
    await expect(calendar.block('Read chapter 5')).toBeVisible()

    const tomorrow = { from: daysFromNow(1, 0), to: daysFromNow(2, 0) }
    // The move is saved behind the optimistic UI: wait for it, don't read once.
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    const items = await trpcQuery<Item[]>(request, 'planItems.list', { ...tomorrow, statuses: ['open', 'done'] })
    const commitments = items.filter((i) => i.kind === 'commitment')
    for (const task of missed) {
      const moved = items.find((i) => i.id === task.id)!
      expect(Date.parse(moved.starts_at!)).toBeGreaterThanOrEqual(Date.parse(tomorrow.from))
      for (const c of commitments) {
        const clear = Date.parse(moved.ends_at!) <= Date.parse(c.starts_at!) || Date.parse(c.ends_at!) <= Date.parse(moved.starts_at!)
        expect(clear, `${task.title} overlaps ${c.title}`).toBe(true)
      }
    }
    // Commitments never move.
    // The move is saved behind the optimistic UI: wait for it, don't read once.
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    const after = await trpcQuery<Item[]>(request, 'planItems.list', {})
    for (const c of before.filter((i) => i.kind === 'commitment')) {
      expect(after.find((i) => i.id === c.id)).toMatchObject({ starts_at: c.starts_at, ends_at: c.ends_at })
    }
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
  })

  test('Keep my plan in the Calendar changes nothing, and the To-do does not ask again', async ({ page, request }) => {
    await seedMissed(request)
    const before = await trpcQuery<Item[]>(request, 'planItems.list', {})
    await board(request, 'My week', ['calendar', 'todo'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    const banner = calendar.root.getByTestId('refit-banner')
    const todo = new PanelGridPom(page).panelByLabel('To-do')
    await expect(todo.getByTestId('refit-banner')).toContainText("2 blocks didn't happen.", { timeout: 10000 })

    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(2)
    // One question at a time: while the Calendar shows new times, the To-do doesn't ask.
    await expect(todo.getByTestId('refit-banner')).toHaveCount(0)
    await banner.getByRole('button', { name: 'Keep my plan' }).click()

    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)
    await expect(banner).toHaveCount(0)
    // Answered once, for every widget.
    await expect(todo.getByTestId('refit-banner')).toHaveCount(0)
    expect(await trpcQuery<Item[]>(request, 'planItems.list', {})).toEqual(before)
  })

  test('a block due before any day with study time left goes over the 2h a day rather than off the calendar', async ({ page, request }) => {
    // Away all today; tomorrow already has its 2h; due the day after at 09:30,
    // before that day's study time can fit an hour.
    await trpcMutation(request, 'planItems.create', { kind: 'commitment', title: 'Away today', starts_at: daysFromNow(0, 0), ends_at: daysFromNow(1, 0) })
    const tomorrowStudy = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Essay plan', duration_min: 120, starts_at: daysFromNow(1, 7), ends_at: daysFromNow(1, 9),
    })
    const due = new Date(Date.parse(daysFromNow(2, 9)) + 30 * 60_000).toISOString()
    const quizPrep = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Quiz prep', duration_min: 60, starts_at: daysFromNow(-1, 10), ends_at: daysFromNow(-1, 11), due_at: due,
    })
    await board(request, 'My week', ['todo'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const banner = new PanelGridPom(page).panelByLabel('To-do').getByTestId('refit-banner')
    await expect(banner).toContainText("1 block didn't happen. Re-fit it?", { timeout: 10000 })
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(banner.getByTestId('refit-proposal')).not.toContainText('It stays on your list.')
    await banner.getByRole('button', { name: 'Move it' }).click()
    await expect(banner).toHaveCount(0)

    // The move is saved behind the optimistic UI: wait for it, don't read once.
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    const items = await trpcQuery<Item[]>(request, 'planItems.list', { from: daysFromNow(1, 0), to: daysFromNow(2, 0), statuses: ['open', 'done'] })
    const moved = items.find((i) => i.id === quizPrep.id)!
    // Tomorrow, before it is due, 10 minutes clear of the 2h already there: over the budget.
    expect(Date.parse(moved.ends_at!)).toBeLessThanOrEqual(Date.parse(due))
    expect(new Date(moved.starts_at!).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }))
      .toBe(new Date(tomorrowStudy.starts_at!).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }))
    const study = items.filter((i) => i.kind === 'task' && i.starts_at)
    expect(study.reduce((sum, i) => sum + (Date.parse(i.ends_at!) - Date.parse(i.starts_at!)) / 60_000, 0)).toBeGreaterThan(120)
  })

  test("Re-fit in the To-do: the Calendar stops asking while it shows the new times, and the moves keep Help me plan's rules", async ({ page, request }) => {
    const missed = await seedMissed(request)
    // Tomorrow already has its 2h of study: re-fit must not add to it.
    const tomorrowStudy = await trpcMutation<Item>(request, 'planItems.create', {
      kind: 'task', title: 'Essay plan', duration_min: 120, starts_at: daysFromNow(1, 9), ends_at: daysFromNow(1, 11),
    })
    await board(request, 'My week', ['calendar', 'todo'])
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendarBanner = new CalendarPom(page).root.getByTestId('refit-banner')
    const todoBanner = new PanelGridPom(page).panelByLabel('To-do').getByTestId('refit-banner')
    await expect(calendarBanner).toContainText("2 blocks didn't happen. Re-fit them?", { timeout: 10000 })

    await todoBanner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(todoBanner).toContainText('Here is where they could go:')
    // Not a second "Re-fit them?" beside the preview.
    await expect(calendarBanner).toHaveCount(0)
    await todoBanner.getByRole('button', { name: 'Move them' }).click()
    await expect(todoBanner).toHaveCount(0)
    await expect(calendarBanner).toHaveCount(0)

    // Where they went: Help me plan's rules (2h a day, 10 minutes apart, from 09:00).
    // The move is saved behind the optimistic UI: wait for it, don't read once.
    await expect.poll(() => trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    const items = await trpcQuery<Item[]>(request, 'planItems.list', { from: daysFromNow(0, 0), to: daysFromNow(9, 0), statuses: ['open', 'done'] })
    const study = items.filter((i) => i.kind === 'task' && i.starts_at && i.ends_at)
    const minutes = (i: Item) => (Date.parse(i.ends_at!) - Date.parse(i.starts_at!)) / 60_000
    const localDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })
    for (const task of missed) {
      const moved = study.find((i) => i.id === task.id)!
      expect(localDay(moved.starts_at!), `${task.title} went on the day already at 2h`).not.toBe(localDay(tomorrowStudy.starts_at!))
      const sameDay = study.filter((i) => localDay(i.starts_at!) === localDay(moved.starts_at!))
      expect(sameDay.reduce((sum, i) => sum + minutes(i), 0), `study on ${localDay(moved.starts_at!)}`).toBeLessThanOrEqual(120)
      const hour = Number(new Date(moved.starts_at!).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }))
      expect(hour).toBeGreaterThanOrEqual(9)
      for (const other of sameDay.filter((i) => i.id !== moved.id)) {
        const gap = Math.max(Date.parse(other.starts_at!) - Date.parse(moved.ends_at!), Date.parse(moved.starts_at!) - Date.parse(other.ends_at!))
        expect(gap, `${task.title} and ${other.title}`).toBeGreaterThanOrEqual(10 * 60_000)
      }
    }
  })
})
