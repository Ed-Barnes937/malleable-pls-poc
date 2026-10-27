import path from 'path'
import { test, expect, type Page } from '@playwright/test'
import { startOfLocalDay } from '../packages/scheduler/src'
import type { PlanItemOccurrence, Recording } from '../packages/substrate/src'
import { AudioCapturePom, CalendarPom, CreateWorkspaceDialogPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcQuery } from './api'
import { reseed } from './reseed'
import { SEED_TIME_ZONE } from './seed-week'

/**
 * The demo script (plans/student-planning-demo.md section 2, run by Ed from
 * docs/demo-runbook.md) end to end, mock AI, on a fresh reseed.
 *
 * Seed and browser share one frozen "now", the demo day: Tue 27 Oct 2026
 * 10:30 London, so Help me plan's numbers are exact. The server runs on the
 * real clock, so the confusion review (placed by the server) and re-fit are
 * checked relative to when the test runs, as journey 7 does.
 */
const NOW = Date.parse('2026-10-27T10:30:00Z')
const WEEK_START = Date.parse('2026-10-26T00:00:00Z')
const WEEK_MS = 7 * 24 * 60 * 60_000
const DEMO_WAV = path.join(__dirname, '..', 'demo', 'lecture-mitochondrial-dna.wav')
const LECTURE = 'Mitochondrial DNA'

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
    await expect(calendar.root.getByText('26 Oct - 1 Nov 2026')).toBeVisible({ timeout: 10000 })
    await expect(calendar.block('Biology lecture')).toHaveCount(2)
    await expect(calendar.block('Cafe shift')).toHaveCount(2)
    const comingUp = grid.panelByLabel('Coming up')
    await expect(comingUp.getByText('Biology quiz')).toBeVisible()
    await expect(comingUp.getByText('Chemistry lab report')).toBeVisible()

    // 2. Plan the week: an honest capacity line, one by hand, then Auto-fill.
    await calendar.root.getByTestId('help-me-plan').click()
    const plan = calendar.root.getByTestId('help-me-plan-panel')
    await expect(plan.getByTestId('plan-capacity')).toContainText('About 9 hours of study time left this week. Your to-dos need 12.')
    const quiz = plan.getByTestId('plan-todo').filter({ hasText: 'Revise for the Biology quiz' })
    await quiz.getByTestId('plan-suggestion').first().click()
    await expect(calendar.block('Revise for the Biology quiz')).toHaveAttribute('aria-label', /10:30 - 12:30/)
    await expect(plan.getByTestId('plan-capacity')).toContainText('About 7 hours of study time left this week. Your to-dos need 10.')

    await plan.getByTestId('autofill').click()
    const draft = plan.getByTestId('autofill-draft')
    await expect(draft.getByTestId('autofill-trim')).toHaveCount(1, { timeout: 15000 })
    await expect(draft.getByTestId('autofill-trim')).toContainText('Shrink "Lab report write-up" to 2h? (now 3h)')
    await draft.getByRole('button', { name: 'Shrink to 2h' }).click()
    await expect(draft.getByTestId('autofill-summary')).toHaveText("Drafted 5h of study time. 4h didn't fit.")
    await draft.getByRole('button', { name: 'Accept all' }).click()
    await expect(calendar.block('Lab report write-up')).toHaveAttribute('aria-label', /Lab report write-up, study time, 12:15 - 14:15/)
    await plan.getByRole('button', { name: /close/i }).first().click()

    // ...and drag one accepted block to a new slot (Fri 08:00 -> 13:00).
    await expect(calendar.block('Chemistry past paper')).toHaveAttribute('aria-label', /08:00 - 10:00/)
    await calendar.drag({ dayIndex: 4, hours: 8.5 }, { dayIndex: 4, hours: 13.5 })
    await expect(calendar.block('Chemistry past paper')).toHaveAttribute('aria-label', /13:00 - 15:00/)

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
    await expect(summary.getByRole('listitem')).toHaveCount(3, { timeout: 30000 })
    await expect(summary).toContainText(/mitochondrial DNA/i)
    // Remove a widget with a click: frees the calendar's evenings.
    await page.getByRole('button', { name: 'Remove Audio Capture from board' }).click()
    await expect(grid.panelByLabel('Audio Capture')).toHaveCount(0)

    const recording = (await trpcQuery<Recording[]>(request, 'recordings.list')).find((r) => r.title === LECTURE)!
    const reviewOf = async () => (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: recording.id, kinds: ['task'],
    }))[0]

    await transcript.getByText(/let me try to explain maternal inheritance/).click()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const chip = transcript.getByTestId('review-chip')
    await expect(chip).toContainText('Review planned', { timeout: 20000 })
    await expect(chip).toContainText('20 min')
    const review = await reviewOf()
    expect(review).toMatchObject({ title: 'Review: maternal inheritance', duration_min: 20, source_offset_ms: 78313, course: 'biology' })
    // Placed by the server on the real clock: as late as possible within 3 days.
    const markedAt = Date.now()
    expect(Date.parse(review.ends_at!)).toBeLessThanOrEqual(startOfLocalDay(markedAt, SEED_TIME_ZONE, 4))
    const todo = grid.panelByLabel('To-do')
    await expect(todo.getByRole('button', { name: `from: ${LECTURE}, 1:18` })).toBeVisible()

    // Click the block: land on that transcript moment.
    const weeksAhead = Math.max(0, Math.floor((Date.parse(review.starts_at!) - WEEK_START) / WEEK_MS))
    for (let i = 0; i < weeksAhead; i++) await calendar.nextWeek()
    await calendar.block('Review: maternal inheritance').click()
    await expect(calendar.root.getByTestId('calendar-moment')).toContainText('Showing this moment in the Transcript.')
    await expect(transcript.locator('[data-moment]')).toContainText('explain maternal inheritance')
    await page.keyboard.press('Escape')
    for (let i = 0; i < weeksAhead; i++) await calendar.root.getByRole('button', { name: 'Previous week' }).click()

    // 5. Malleability: "30 min by tomorrow" and the block moves.
    const chipBefore = await chip.textContent()
    await transcript.locator('[data-testid^="panel-automations-"]').click()
    const dialog = page.getByRole('dialog', { name: 'Automations · Transcript' })
    const sentence = dialog.getByTestId('review-automation-sentence')
    await expect(sentence).toContainText('When I mark something')
    await sentence.getByLabel('Review length in minutes').selectOption('30')
    await expect(sentence).toContainText(/Moved \d+ reviews? to fit/)
    await sentence.getByLabel('When the review should happen by').selectOption({ label: 'by tomorrow' })
    await dialog.getByRole('button', { name: /close/i }).click()
    await expect(chip).toContainText('30 min')
    await expect(chip).not.toHaveText(chipBefore!)
    // By the end of (real) tomorrow, 30 minutes long.
    await expect.poll(async () => Date.parse((await reviewOf()).ends_at!), { timeout: 10000 })
      .toBeLessThanOrEqual(startOfLocalDay(markedAt, SEED_TIME_ZONE, 2))
    const moved = await reviewOf()
    expect(moved.id).toBe(review.id)
    expect(Date.parse(moved.ends_at!) - Date.parse(moved.starts_at!)).toBe(30 * 60_000)

    // ...and add a widget with a click.
    await addWidgets(page, ['Weakest Topics'])
    const weakest = grid.panelByLabel('Weakest Topics')

    // 6. Encores. Weak topics read as topics; click one, jump to its moment.
    await expect(weakest.getByTestId('weak-topic').filter({ hasText: 'Maternal inheritance' })).toHaveCount(2, { timeout: 10000 })
    await weakest.getByRole('button', { name: /^Paternal inheritance: go to this moment/ }).click()
    await expect(transcript.locator('[data-moment]')).toContainText('paternal mitochondrial inheritance', { timeout: 10000 })

    // Missed blocks: a calm question, then the blocks move.
    const banner = todo.getByTestId('refit-banner')
    await expect(banner).toContainText("2 blocks didn't happen. Re-fit them?", { timeout: 10000 })
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(banner.getByTestId('refit-proposal')).toHaveCount(2)
    await banner.getByRole('button', { name: 'Move them' }).click()
    await expect(todo.getByRole('status')).toHaveText("Moved 2 blocks. They're in your calendar.")
  })
})
