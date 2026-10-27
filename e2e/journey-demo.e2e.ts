import path from 'path'
import { test, expect, type Page } from '@playwright/test'
import { startOfLocalDay, wallClock, zonedTimeToUtc } from '../packages/scheduler/src'
import type { PlanItem, PlanItemOccurrence, Recording } from '../packages/substrate/src'
import { AudioCapturePom, CalendarPom, CreateWorkspaceDialogPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcQuery } from './api'
import { reseed } from './reseed'
import { expectedReviewSlots } from './review-placement'
import { SEED_MISSED_IDS, SEED_TIME_ZONE, weekMonday } from './seed-week'

/**
 * The demo script (plans/student-planning-demo.md section 2, run by Ed from
 * docs/demo-runbook.md) end to end, mock AI, on a fresh reseed.
 *
 * Seed and browser share one frozen "now", by default the demo day, Tue 27
 * Oct 2026 10:30 London. `DEMO_NOW` pins another instant: any Mon-Wed
 * daytime up to the real date (the seed's missed blocks must have passed
 * for the server too). Nothing here depends on the time of day; the reseed
 * sizes the week so Help me plan reads the same (see seed-week.ts).
 *
 * The server runs on the real clock, so the confusion review it places is
 * checked relative to the real now (as journey 7 does), and re-fit only on
 * the seeded missed blocks: once the real clock passes them, accepted blocks
 * count as missed too.
 */
const NOW = Date.parse(process.env.DEMO_NOW ?? '2026-10-27T10:30:00Z')
const WEEK_MS = 7 * 24 * 60 * 60_000
const DEMO_WAV = path.join(__dirname, '..', 'demo', 'lecture-mitochondrial-dna.wav')
const LECTURE = 'Mitochondrial DNA - today'
const AUTOFILLED = ['seed-todo-past-paper', 'seed-todo-problem-sheet', 'seed-todo-flashcards', 'seed-todo-essay-plan']

/** Monday 00:00 London of the week containing `now`. */
function weekStart(now: number): number {
  const m = weekMonday(now)
  return zonedTimeToUtc(m.year, m.month, m.day, 0, SEED_TIME_ZONE)
}

/** Day column (0 = Monday) and hours of an instant in London. */
function gridPos(instant: number): { dayIndex: number; hours: number } {
  const w = wallClock(instant, SEED_TIME_ZONE)
  const dayIndex = Math.floor((startOfLocalDay(instant, SEED_TIME_ZONE) - weekStart(instant)) / (24 * 3_600_000) + 0.5)
  return { dayIndex, hours: w.hour + w.minute / 60 }
}

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: SEED_TIME_ZONE })

async function addWidgets(page: Page, labels: string[]) {
  await new TopBarPom(page).openDrawer()
  const sidebar = new SidebarPom(page)
  for (const label of labels) await sidebar.addWidget(label)
  await page.keyboard.press('Escape')
}

test.describe('Journey: the demo script (mock AI)', () => {
  test.beforeEach(async () => { await reseed({ now: NOW }) })
  test.afterAll(async () => { await reseed() })

  test('build a board, plan the week, scope, lecture, automation, encores', async ({ page, request }) => {
    test.setTimeout(120_000)
    await page.clock.setFixedTime(NOW)
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    const calendar = new CalendarPom(page)

    // 1. Build a board live: Calendar, To-do and Coming up, one click each.
    await page.goto('/')
    await topBar.openCreateWorkspaceDialog()
    await new CreateWorkspaceDialogPom(page).createWorkspace('My week')
    await grid.expectEmpty()
    await addWidgets(page, ['Calendar', 'To-do', 'Coming up'])
    await expect(calendar.block('Biology lecture')).toHaveCount(2, { timeout: 10000 })
    await expect(calendar.block('Cafe shift')).toHaveCount(2)
    const comingUp = grid.panelByLabel('Coming up')
    await expect(comingUp.getByText('Biology quiz')).toBeVisible()
    await expect(comingUp.getByText('Chemistry lab report')).toBeVisible()

    // 2. Plan the week: an honest capacity line, one by hand, then Auto-fill.
    await calendar.root.getByTestId('help-me-plan').click()
    const plan = calendar.root.getByTestId('help-me-plan-panel')
    await expect(plan.getByTestId('plan-capacity')).toContainText('About 9 hours of study time left this week (2h a day). Your to-dos need 12.')
    const quiz = plan.getByTestId('plan-todo').filter({ hasText: 'Revise for the Biology quiz' })
    await quiz.getByTestId('plan-suggestion').first().click()
    await expect(calendar.block('Revise for the Biology quiz')).toHaveCount(1)
    await expect(plan.getByTestId('plan-capacity')).toContainText('About 7 hours of study time left this week (2h a day). Your to-dos need 10.')

    await plan.getByTestId('autofill').click()
    const draft = plan.getByTestId('autofill-draft')
    await expect(draft.getByTestId('autofill-trim')).toHaveCount(1, { timeout: 15000 })
    await expect(draft.getByTestId('autofill-trim')).toContainText('Lab report write-up (3h) is too long for one day.')
    await draft.getByRole('button', { name: 'Shrink to 2h' }).click()
    await expect(draft.getByTestId('autofill-summary')).toHaveText(/^Drafted .+ of study time\. .+ didn't fit\.( The other .+ of free time is in gaps too short for it\.)?$/)
    await plan.getByRole('button', { name: 'Accept draft' }).click()
    await expect(calendar.block('Lab report write-up')).toHaveCount(1)
    await plan.getByRole('button', { name: /close/i }).first().click()

    // ...and drag one accepted block to a new slot: Saturday 15:00, always free.
    const firstAccepted = async () => (await trpcQuery<PlanItem[]>(request, 'planItems.list', { kinds: ['task'] }))
      .find((i) => AUTOFILLED.includes(i.id) && i.starts_at)
    await expect.poll(firstAccepted).toBeTruthy()
    const accepted = (await firstAccepted())!
    await expect(calendar.block(accepted.title)).toHaveCount(1)
    const from = gridPos(Date.parse(accepted.starts_at!))
    await calendar.drag({ dayIndex: from.dayIndex, hours: from.hours + 0.5 }, { dayIndex: 5, hours: 15.5 })
    await expect(calendar.block(accepted.title)).toHaveAttribute('aria-label', / 15:00 - /)

    // 3. Scope: the board shows Biology; nothing is hidden silently.
    await topBar.openDrawer()
    await new SidebarPom(page).selectCourse('Biology')
    await page.keyboard.press('Escape')
    await expect(topBar.scopeChip).toContainText('Biology')
    await expect(calendar.root.getByText('Biology highlighted')).toBeVisible()
    await expect(comingUp.getByText('+1 in other courses')).toBeVisible()
    await expect(comingUp.getByText('Chemistry lab report')).toHaveCount(0)

    // 4. Lecture: upload the demo lecture; transcript and a 3-line summary.
    await addWidgets(page, ['Audio Capture', 'Transcript'])
    const audio = new AudioCapturePom(grid.panelByLabel('Audio Capture'))
    await audio.pickFile(DEMO_WAV)
    await audio.submitUpload({ title: LECTURE })
    const transcript = grid.panelByLabel('Transcript')
    const summary = transcript.getByRole('region', { name: 'Lecture summary' })
    await expect(summary.getByTestId('summary-line')).toBeVisible({ timeout: 30000 })
    await summary.getByRole('button', { name: 'More' }).click()
    await expect(summary.getByRole('listitem')).toHaveCount(3)
    await expect(summary).toContainText(/mitochondrial DNA/i)
    await summary.getByRole('button', { name: 'Less' }).click()
    // Remove a widget with a click: frees the calendar's evenings.
    await page.getByRole('button', { name: 'Remove Audio Capture from board' }).click()
    await expect(grid.panelByLabel('Audio Capture')).toHaveCount(0)

    const recording = (await trpcQuery<Recording[]>(request, 'recordings.list')).find((r) => r.title === LECTURE)!
    const reviewOf = async () => (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: recording.id, kinds: ['task'],
    }))[0]

    // The ripple: a review card lifts off the moment (too quick to poll for,
    // so it is recorded), the To-do row slides in, and the toast offers "See it".
    // The card is drawn over the page, outside the widget.
    await page.locator('body').evaluate((el) => {
      const w = window as unknown as { liftedOff: boolean }
      w.liftedOff = false
      new MutationObserver(() => {
        if (el.querySelector('[data-testid="review-lift-off"]')) w.liftedOff = true
      }).observe(el, { subtree: true, childList: true })
    })
    await transcript.getByText(/let me try to explain maternal inheritance/).click()
    const markedFrom = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const chip = transcript.getByTestId('review-chip')
    await expect(chip).toContainText('Review planned · ', { timeout: 20000 })
    const markedTo = Date.now()
    await expect(chip).toContainText('20 min')
    const review = await reviewOf()
    expect(review).toMatchObject({ title: 'Review: maternal inheritance', duration_min: 20, source_offset_ms: 78313, course: 'biology' })
    // Placed by the server on the real clock: the earliest free time within 3
    // days, an hour after the mark, from 09:00, around the shifts and every
    // accepted block, on a day with study time left.
    const deadline = startOfLocalDay(markedFrom, SEED_TIME_ZONE, 4)
    expect(Date.parse(review.ends_at!)).toBeLessThanOrEqual(deadline)
    expect(Date.parse(review.starts_at!)).toBeGreaterThanOrEqual(markedFrom + 60 * 60_000)
    expect(wallClock(Date.parse(review.starts_at!), SEED_TIME_ZONE).hour).toBeGreaterThanOrEqual(9)
    const expected = await expectedReviewSlots(
      request,
      { id: review.id, durationMin: 20, latest: deadline },
      { from: markedFrom, to: markedTo },
      SEED_TIME_ZONE,
    )
    expect(expected.map((slot) => slot?.start)).toContain(Date.parse(review.starts_at!))
    await expect.poll(() => page.evaluate(() => (window as unknown as { liftedOff: boolean }).liftedOff)).toBe(true)
    const todo = grid.panelByLabel('To-do')
    const reviewRow = todo.getByTestId('todo-item').filter({ hasText: 'Review: maternal inheritance' })
    await expect(reviewRow).toHaveAttribute('data-fresh', 'true')
    await expect(reviewRow.getByRole('button', { name: `From ${LECTURE} · 1:18` })).toBeVisible()

    // "See it": the calendar opens the review's week, scrolls to it and it glows once.
    const toast = page.getByTestId('toast-host')
    await expect(toast).toContainText('Review added to your plan')
    await toast.getByRole('button', { name: 'See it' }).click()
    const reviewBlock = calendar.block('Review: maternal inheritance')
    await expect(reviewBlock).toHaveAttribute('data-revealed', 'true')
    await expect(reviewBlock).toBeInViewport()
    await expect(calendar.root.getByTestId('calendar-reveal')).toContainText(`From ${LECTURE} · 1:18`)

    // Click the block: land on that transcript moment.
    const weeksAhead = Math.max(0, Math.round((weekStart(Date.parse(review.starts_at!)) - weekStart(NOW)) / WEEK_MS))
    await reviewBlock.click()
    await expect(calendar.root.getByTestId('calendar-moment')).toContainText('Showing this moment in the Transcript.')
    await expect(transcript.locator('[data-moment]')).toContainText('explain maternal inheritance')
    await page.keyboard.press('Escape')
    for (let i = 0; i < weeksAhead; i++) await calendar.root.getByRole('button', { name: 'Previous week' }).click()

    // 5. Malleability: make reviews 30 minutes. With earliest placement the
    // block usually stays where it is and gets longer; it moves only if 30
    // minutes no longer fit there. Either way it is where placeReviews says.
    const chipBefore = await chip.textContent()
    await transcript.locator('[data-testid^="panel-automations-"]').click()
    const dialog = page.getByRole('dialog', { name: 'Automations · Transcript' })
    const sentence = dialog.getByTestId('review-automation-sentence')
    await expect(sentence).toContainText('When I mark something')
    const editFrom = Date.now()
    await sentence.getByLabel('Review length in minutes').selectOption('30')
    await expect(sentence).toContainText('Saved.')
    const editTo = Date.now()
    const longer = await reviewOf()
    expect(longer.id).toBe(review.id)
    expect(longer.duration_min).toBe(30)
    expect(Date.parse(longer.ends_at!) - Date.parse(longer.starts_at!)).toBe(30 * 60_000)
    const replaced = await expectedReviewSlots(
      request,
      { id: review.id, durationMin: 30, latest: deadline, markedAt: Date.parse(review.created_at) },
      { from: editFrom, to: editTo },
      SEED_TIME_ZONE,
    )
    expect(replaced.map((slot) => slot?.start)).toContain(Date.parse(longer.starts_at!))
    // The sentence says what happened to it.
    await expect(sentence).toContainText(longer.starts_at === review.starts_at
      ? 'Saved. Your review is now 30 min.'
      : 'Saved. Moved 1 review to fit.')
    await dialog.getByRole('button', { name: /close/i }).click()
    await expect(chip).toContainText('30 min')
    await expect(chip).not.toHaveText(chipBefore!)

    // ...and add a widget with a click.
    await addWidgets(page, ['Weakest Topics'])
    const weakest = grid.panelByLabel('Weakest Topics')

    // 6. Encores. Weak topics read as topics; click one, jump to its moment.
    await expect(weakest.getByTestId('weak-topic').filter({ hasText: 'Maternal inheritance' })).toHaveCount(2, { timeout: 10000 })
    await weakest.getByRole('button', { name: /^Paternal inheritance: go to this moment/ }).click()
    await expect(transcript.locator('[data-moment]')).toContainText('paternal mitochondrial inheritance', { timeout: 10000 })

    // Missed blocks: a calm question, then the blocks move. Yesterday's two
    // seeded ones always count; on the real clock, accepted blocks may too.
    const banner = todo.getByTestId('refit-banner')
    await expect(banner).toContainText(/\d+ blocks didn't happen\. Re-fit them\?/, { timeout: 10000 })
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    for (const title of ['Read lecture notes: cell division', 'Practice questions: cell structure']) {
      await expect(banner.getByTestId('refit-proposal').filter({ hasText: title })).toHaveCount(1)
    }
    const missedBefore = (await trpcQuery<PlanItem[]>(request, 'planItems.list', { kinds: ['task'] }))
      .filter((i) => (SEED_MISSED_IDS as readonly string[]).includes(i.id))
    expect(missedBefore).toHaveLength(2)
    await banner.getByRole('button', { name: 'Move them' }).click()
    await expect(todo.getByRole('status')).toHaveText(/^Moved \d+ blocks\. They're in your calendar\.$/)
    const missedAfter = (await trpcQuery<PlanItem[]>(request, 'planItems.list', { kinds: ['task'] }))
      .filter((i) => (SEED_MISSED_IDS as readonly string[]).includes(i.id))
    for (const item of missedAfter) {
      expect(Date.parse(item.starts_at!), item.title).toBeGreaterThan(Date.now() - 5 * 60_000)
    }
  })
})
