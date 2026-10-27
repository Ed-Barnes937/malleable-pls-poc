import { test, expect, type APIRequestContext } from '@playwright/test'
import { PanelGridPom, TopBarPom } from './pom'
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
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType, slotName: lensType, pos_x: x, pos_y: 24, width: 440, height: 600 })
    x += 464
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

  test('from a board without a Transcript, it opens the moment in one that has it', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Exam Prep')
    const weakest = new PanelGridPom(page).panelByLabel('Weakest Topics')

    await weakest.getByRole('button', { name: /^Maternal inheritance: go to this moment/ }).click()
    await expect(weakest.getByText('This board has no Transcript.')).toBeVisible()
    await weakest.getByRole('button', { name: 'Open in a board with Transcript' }).click()

    await topBar.expectActiveWorkspace('Evening Review')
    const moment = new PanelGridPom(page).panelByLabel('Transcript').locator('[data-moment]')
    await expect(moment).toContainText('inherited exclusively from the maternal line', { timeout: 10000 })
    await expect(moment).toBeInViewport()
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
})
