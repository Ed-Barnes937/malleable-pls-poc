import path from 'path'
import { test, expect } from '@playwright/test'
import { startOfLocalDay, wallClock, zonedTimeToUtc } from '../packages/scheduler/src'
import type { PlanItem, PlanItemOccurrence, Recording } from '../packages/substrate/src'
import { AudioCapturePom, PanelGridPom, TopBarPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
import { reseed } from './reseed'

const FIXTURE = path.join(__dirname, 'fixtures', 'lecture-tone.wav')
// The seeded automation and the browser both use London days, so "within 3
// days" and "by tomorrow" mean the same thing to the test and the server.
const TZ = 'Europe/London'
const MIN = 60_000

test.use({ timezoneId: TZ })

function atLocal(dayStart: number, hour: number): number {
  const w = wallClock(dayStart, TZ)
  return zonedTimeToUtc(w.year, w.month, w.day, hour * 60, TZ)
}

test.describe('Journey: Lecture AI and the confusion automation (mock AI)', () => {
  // The journey adds a board, a shift and a review; put the seed back after.
  test.afterAll(async () => { await reseed() })

  test('upload -> summary; confused -> linked review around a shift; edit the automation -> the review moves', async ({ page, request }) => {
    const title = `Mito lecture ${Date.now()}`
    const now = Date.now()
    // A shift filling the last evening of the "within 3 days" window.
    const lastDay = startOfLocalDay(now, TZ, 3)
    const shift = await trpcMutation<PlanItem>(request, 'planItems.create', {
      kind: 'commitment',
      title: 'Cafe shift',
      subtype: 'shift',
      starts_at: new Date(atLocal(lastDay, 17)).toISOString(),
      ends_at: new Date(atLocal(lastDay, 22)).toISOString(),
    })

    // A board the student built: capture, transcript and their to-do list.
    const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Lecture and plan' })
    for (const [i, lensType] of ['audio-capture', 'transcript', 'todo'].entries()) {
      await trpcMutation(request, 'workspaces.addPanel', {
        workspaceId: board.id, lensType, slotName: `slot-${lensType}`,
        pos_x: 16 + i * 410, pos_y: 16, width: 400, height: 560, z_index: i + 1,
      })
    }

    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Lecture and plan')
    const todo = grid.panelByLabel('To-do')
    const audio = new AudioCapturePom(grid.panelByLabel('Audio Capture'))
    const transcript = grid.panelByLabel('Transcript')

    // 1. Upload: the transcript, then a 3-line summary built from it, appear.
    await audio.pickFile(FIXTURE)
    await audio.submitUpload({ title, course: 'Biology' })
    await expect(transcript.getByText(title)).toBeVisible({ timeout: 10000 })
    await expect(transcript.getByText('6 segments')).toBeVisible({ timeout: 20000 })
    const summary = transcript.getByRole('region', { name: 'Lecture summary' })
    await expect(summary.getByRole('listitem')).toHaveCount(3, { timeout: 20000 })
    await expect(summary).toContainText(/mitochondrial DNA/i)

    const recording = (await trpcQuery<Recording[]>(request, 'recordings.list')).find((r) => r.title === title)!
    const reviewsOf = async () => (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: recording.id, kinds: ['task'],
    }))

    // 2. Mark the maternal-inheritance moment as confusing.
    await transcript.getByText(/This is what we call maternal inheritance/).click()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const chip = transcript.getByTestId('review-chip')
    await expect(chip).toContainText('Review planned', { timeout: 15000 })
    await expect(chip).toContainText('20 min')

    const [review] = await reviewsOf()
    expect(review).toMatchObject({
      title: 'Review: maternal inheritance',
      duration_min: 20,
      source_type: 'recording',
      source_id: recording.id,
      source_offset_ms: 95000,
      course: 'biology',
      status: 'open',
    })
    const start = Date.parse(review.starts_at!)
    const end = Date.parse(review.ends_at!)
    expect(end - start).toBe(20 * MIN)
    expect(start).toBeGreaterThanOrEqual(now)
    // Within 3 days, late in the window, clear of the shift (and its buffer).
    expect(end).toBeLessThanOrEqual(startOfLocalDay(now, TZ, 4))
    expect(end).toBeLessThanOrEqual(Date.parse(shift.starts_at!) - 10 * MIN)
    expect(start).toBeGreaterThanOrEqual(startOfLocalDay(now, TZ, 3))
    const chipBefore = await chip.textContent()

    // The review is on the To-do list, linked back to the moment it came from.
    await expect(todo.getByText('Review: maternal inheritance')).toBeVisible()
    await expect(todo.getByRole('button', { name: `from: ${title}, 1:35` })).toBeVisible()

    // 3. Edit the automation in the Transcript widget: 30 min, by tomorrow.
    await transcript.locator('[data-testid^="panel-automations-"]').click()
    const dialog = page.getByRole('dialog', { name: 'Automations · Transcript' })
    const sentence = dialog.getByTestId('review-automation-sentence')
    await expect(sentence).toContainText('When I mark something')
    await sentence.getByLabel('Review length in minutes').selectOption('30')
    // Earlier journeys mark moments too, so this may move more than our review.
    await expect(sentence).toContainText(/Moved \d+ reviews? to fit/)
    await sentence.getByLabel('When the review should happen by').selectOption({ label: 'by tomorrow' })
    await expect(sentence).toContainText(/Moved \d+ reviews? to fit/)
    await dialog.getByRole('button', { name: /close/i }).click()
    await expect(dialog).toBeHidden()

    // The block visibly moves: tomorrow, 30 minutes.
    await expect(chip).toContainText('30 min')
    await expect(chip).not.toHaveText(chipBefore!)
    const [moved] = await reviewsOf()
    expect(moved.id).toBe(review.id)
    expect(Date.parse(moved.ends_at!) - Date.parse(moved.starts_at!)).toBe(30 * MIN)
    expect(Date.parse(moved.starts_at!)).toBeGreaterThanOrEqual(startOfLocalDay(now, TZ, 1))
    expect(Date.parse(moved.ends_at!)).toBeLessThanOrEqual(startOfLocalDay(now, TZ, 2))

    // The shift never moves.
    const [shiftAfter] = await trpcQuery<PlanItem[]>(request, 'planItems.list', { kinds: ['commitment'] })
      .then((items) => items.filter((i) => i.id === shift.id))
    expect(shiftAfter).toMatchObject({ starts_at: shift.starts_at, ends_at: shift.ends_at })
  })
})
