import { test, expect } from './test'
import type { APIRequestContext } from '@playwright/test'
import type { PlanItem, PlanItemOccurrence, Tag } from '@pls/substrate'
import { TopBarPom, PanelGridPom, SidebarPom, PanelContainerPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
import { reseed } from './reseed'

// Flow audit 02: a confusing moment the student marks sorted.

/** The 9:00 moment of the Biology lecture: seeded as confused (and key point). */
const NINE = 'seg-bio4-04'
/** Its review, seeded as done: reopened here so the moment has an open review to dismiss. */
const NINE_REVIEW = 'seed-review-maternal'

const tagsOn = async (request: APIRequestContext, segmentId: string) =>
  (await trpcQuery<Tag[]>(request, 'tags.forTarget', { targetType: 'transcript_segment', targetId: segmentId })).map((t) => t.label).sort()
const statusOf = async (request: APIRequestContext, id: string) =>
  (await trpcQuery<PlanItem>(request, 'planItems.byId', id)).status

test.describe('Sorted moments', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('marking the 9:00 confusing moment sorted drops it from the counts and dismisses its review; Undo brings it all back', async ({ page, request }) => {
    await trpcMutation(request, 'planItems.update', { id: NINE_REVIEW, patch: { status: 'open' } })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Weakest Topics')
    await page.keyboard.press('Escape')

    const transcript = grid.panelByLabel('Transcript')
    const progress = grid.panelByLabel('Your Progress')
    const weakest = grid.panelByLabel('Weakest Topics')
    await expect(transcript.getByText('14 segments')).toBeVisible({ timeout: 10000 })
    // Evening Review is a Biology board: 5 moments to review.
    await expect(progress.getByText('5 moments to review')).toBeVisible({ timeout: 10000 })
    await expect(weakest.getByText(/^5 to review$/)).toBeVisible()

    const moment = transcript.locator(`[data-segment-id="${NINE}"]`)
    await expect(moment.getByTestId('review-chip')).toBeVisible()
    await moment.locator('> button').click()
    await expect(transcript.getByRole('button', { name: 'Confused', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await transcript.getByRole('button', { name: 'Mark sorted' }).click()

    // Sorted: shown on the moment, out of both counts, its review dismissed.
    await expect(transcript.getByRole('button', { name: 'Sorted', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(moment.getByTestId('sorted-pill')).toBeVisible()
    await expect(moment.getByTestId('review-chip')).toHaveCount(0)
    await expect(progress.getByText('4 moments to review')).toBeVisible()
    await expect(weakest.getByText(/^4 to review$/)).toBeVisible()
    await expect.poll(() => statusOf(request, NINE_REVIEW)).toBe('dismissed')
    expect(await tagsOn(request, NINE)).toEqual(['confused', 'key-point', 'sorted'])

    const toast = page.getByTestId('toast-host').getByTestId('toast').filter({ hasText: 'Marked sorted' })
    await expect(toast).toContainText('Its review is off your plan')
    await toast.getByRole('button', { name: 'Undo' }).click()

    await expect(moment.getByTestId('sorted-pill')).toHaveCount(0)
    await expect(transcript.getByRole('button', { name: 'Mark sorted' })).toHaveAttribute('aria-pressed', 'false')
    await expect(moment.getByTestId('review-chip')).toBeVisible()
    await expect(progress.getByText('5 moments to review')).toBeVisible()
    await expect(weakest.getByText(/^5 to review$/)).toBeVisible()
    await expect.poll(() => statusOf(request, NINE_REVIEW)).toBe('open')
    expect(await tagsOn(request, NINE)).toEqual(['confused', 'key-point'])
  })

  test('clicking confused twice never makes two tags or two reviews: the second click takes the mark and its review off, with Undo', async ({ page, request }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    const transcript = grid.panelByLabel('Transcript')
    await expect(transcript.getByText('14 segments')).toBeVisible({ timeout: 10000 })

    // seg-bio4-01, untagged.
    const moment = transcript.locator('[data-segment-id="seg-bio4-01"]')
    await moment.locator('> button').click()
    const confused = transcript.getByRole('button', { name: 'Confused', exact: true })
    await confused.click()
    await expect(confused).toHaveAttribute('aria-pressed', 'true')
    await expect(moment.getByTestId('review-chip')).toBeVisible({ timeout: 20000 })

    const [review] = (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: 'rec-bio-4', kinds: ['task'], statuses: ['open'],
    })).filter((r) => r.source_offset_ms === 0)
    expect(review).toBeTruthy()
    expect(await tagsOn(request, 'seg-bio4-01')).toEqual(['confused'])

    // A second click takes the mark off, and its review off the plan, with Undo.
    await confused.click()
    await expect(confused).toHaveAttribute('aria-pressed', 'false')
    await expect(moment.getByTestId('review-chip')).toHaveCount(0)
    await expect.poll(() => tagsOn(request, 'seg-bio4-01')).toEqual([])
    await expect.poll(() => statusOf(request, review.id)).toBe('dismissed')
    const toast = page.getByTestId('toast-host').getByTestId('toast').filter({ hasText: 'No longer marked confusing' })
    await toast.getByRole('button', { name: 'Undo' }).click()

    // Undo: the one mark and the one review are back, and nothing new was made.
    await expect(confused).toHaveAttribute('aria-pressed', 'true')
    await expect(moment.getByTestId('review-chip')).toBeVisible()
    await expect.poll(() => statusOf(request, review.id)).toBe('open')
    expect(await tagsOn(request, 'seg-bio4-01')).toEqual(['confused'])
    const reviews = (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: 'rec-bio-4', kinds: ['task'], statuses: ['open', 'done', 'dismissed'],
    })).filter((r) => r.source_offset_ms === 0)
    expect(reviews.map((r) => r.id)).toEqual([review.id])
  })

  test('marking a moment confusing counts it to review, turning it off takes it out, and marking again leaves no stale Undo', async ({ page, request }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    const transcript = grid.panelByLabel('Transcript')
    const progress = grid.panelByLabel('Your Progress')
    await expect(progress.getByText('5 moments to review')).toBeVisible({ timeout: 10000 })

    // seg-bio4-01: untagged and never rated.
    const moment = transcript.locator('[data-segment-id="seg-bio4-01"]')
    await moment.locator('> button').click()
    const confused = transcript.getByRole('button', { name: 'Confused', exact: true })
    await confused.click()
    await expect(progress.getByText('6 moments to review')).toBeVisible()
    await expect(moment.getByTestId('review-chip')).toBeVisible({ timeout: 20000 })

    await confused.click()
    await expect(progress.getByText('5 moments to review')).toBeVisible()
    const toasts = page.getByTestId('toast-host').getByTestId('toast')
    await expect(toasts.filter({ hasText: 'No longer marked confusing' })).toBeVisible()

    // Marked again: its toast replaces the one whose Undo would double the mark and review.
    await confused.click()
    await expect(progress.getByText('6 moments to review')).toBeVisible()
    await expect(toasts.filter({ hasText: 'No longer marked confusing' })).toHaveCount(0)
    await expect(moment.getByTestId('review-chip')).toBeVisible({ timeout: 20000 })
    await expect.poll(async () => (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: 'rec-bio-4', kinds: ['task'], statuses: ['open'],
    })).filter((r) => r.source_offset_ms === 0).length).toBe(1)
  })

  test('confused on and straight off again leaves no review behind', async ({ page, request }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    const transcript = grid.panelByLabel('Transcript')
    await expect(transcript.getByText('14 segments')).toBeVisible({ timeout: 10000 })
    await transcript.locator('[data-segment-id="seg-bio4-02"] > button').click()
    const confused = transcript.getByRole('button', { name: 'Confused', exact: true })
    await confused.click()
    await expect(confused).toHaveAttribute('aria-pressed', 'true')
    await confused.click()
    await expect(confused).toHaveAttribute('aria-pressed', 'false')
    type Run = { job_type: string; status: string; input: { target_id?: string } }
    await expect.poll(async () => (await trpcQuery<Run[]>(request, 'jobs.recent', 50))
      .filter((j) => j.job_type === 'plan:review-task' && j.input.target_id === 'seg-bio4-02' && j.status === 'completed').length, { timeout: 20000 }).toBe(1)
    const open = (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: 'rec-bio-4', kinds: ['task'], statuses: ['open'],
    })).filter((r) => r.source_offset_ms === 180000)
    expect(open).toEqual([])
    expect(await tagsOn(request, 'seg-bio4-02')).toEqual([])
  })

  test('the to-review chip starts a focused Test Me review of just those moments', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    const progress = grid.panelByLabel('Your Progress')
    const testMe = grid.panelByLabel('Test Me')
    await progress.getByRole('button', { name: '5 moments to review' }).click()
    await expect(testMe.getByTestId('review-run-header')).toHaveText('Moments to review · 1 of 5')
    await testMe.getByRole('button', { name: 'End review' }).click()
    await expect(testMe.getByTestId('review-run-header')).toHaveCount(0)
  })

  test('with two Test Me widgets, only the first takes the review', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Test Me')
    await page.keyboard.press('Escape')
    await expect(grid.panelByLabel('Test Me')).toHaveCount(2)
    await grid.panelByLabel('Your Progress').getByRole('button', { name: '5 moments to review' }).click()
    await expect(grid.panelByLabel('Test Me').first().getByTestId('review-run-header')).toHaveText('Moments to review · 1 of 5')
    await expect(page.getByTestId('review-run-header')).toHaveCount(1)
  })

  test('on a board without Test Me, the chip adds one for the review, with Undo', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await new PanelContainerPom(grid.panelByLabel('Test Me')).remove()
    await expect(grid.panelByLabel('Test Me')).toHaveCount(0)

    await grid.panelByLabel('Your Progress').getByRole('button', { name: '5 moments to review' }).click()
    const testMe = grid.panelByLabel('Test Me')
    await expect(testMe.getByTestId('review-run-header')).toHaveText('Moments to review · 1 of 5', { timeout: 10000 })
    const toast = page.getByTestId('toast-host').getByTestId('toast').filter({ hasText: 'Test Me added' })
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(grid.panelByLabel('Test Me')).toHaveCount(0)
  })
})
