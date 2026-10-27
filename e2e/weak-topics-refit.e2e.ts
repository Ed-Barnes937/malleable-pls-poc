import { test, expect, type APIRequestContext } from '@playwright/test'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { SEED_MISSED_IDS } from './seed-week'
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
    await expect(topBar.scopeChip).toContainText('Biology Lecture: Mitochondrial DNA')
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

    await grid.panelByLabel('To-do').getByRole('button', { name: 'from: Biology Lecture: Mitochondrial DNA, 9:00' }).click()
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

    await expect(todo.getByRole('status')).toHaveText("Moved 2 blocks. They're in your calendar.")
    await expect(todo.getByTestId('refit-banner')).toHaveCount(0)
    await expect(todo.getByText(/^Still to do from /)).toHaveCount(0)

    const items = await trpcQuery<Item[]>(request, 'planItems.list', {})
    const byId = (id: string) => items.find((i) => i.id === id)!
    for (const task of [readChapter, labWriteUp]) {
      expect(Date.parse(byId(task.id).starts_at!)).toBeGreaterThan(Date.now() - 5 * 60_000)
    }
    expect(Date.parse(byId(readChapter.id).ends_at!) - Date.parse(byId(readChapter.id).starts_at!)).toBe(30 * 60_000)
    expect(byId(shift.id).starts_at).toBe(shift.starts_at)
    expect(byId(done.id).starts_at).toBe(done.starts_at)
    expect(await trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
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
    await expect(calendar.root.getByTestId('refit-note')).toHaveText("Moved 2 blocks. They're in your calendar.")
    await expect(ghosts).toHaveCount(0)
    await expect(calendar.block('Read chapter 5')).toBeVisible()

    const tomorrow = { from: daysFromNow(1, 0), to: daysFromNow(2, 0) }
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
    const after = await trpcQuery<Item[]>(request, 'planItems.list', {})
    for (const c of before.filter((i) => i.kind === 'commitment')) {
      expect(after.find((i) => i.id === c.id)).toMatchObject({ starts_at: c.starts_at, ends_at: c.ends_at })
    }
    expect(await trpcQuery(request, 'planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
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
    await banner.getByRole('button', { name: 'Keep my plan' }).click()

    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)
    await expect(banner).toHaveCount(0)
    // Answered once, for every widget.
    await expect(todo.getByTestId('refit-banner')).toHaveCount(0)
    expect(await trpcQuery<Item[]>(request, 'planItems.list', {})).toEqual(before)
  })
})
