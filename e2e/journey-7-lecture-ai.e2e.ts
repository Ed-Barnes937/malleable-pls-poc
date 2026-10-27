import path from 'path'
import { test, expect } from '@playwright/test'
import { startOfLocalDay, wallClock, zonedTimeToUtc } from '../packages/scheduler/src'
import type { PlanItem, PlanItemOccurrence, Recording } from '../packages/substrate/src'
import { AudioCapturePom, PanelGridPom, TopBarPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
import { reseed } from './reseed'
import { expectedReviewSlots } from './review-placement'

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

  test('upload -> summary; confused -> linked review in the earliest free time around a shift; edit the automation', async ({ page, request }) => {
    const title = `Mito lecture ${Date.now()}`
    const now = Date.now()
    // A shift over tomorrow morning's study time: if today has no room, the
    // review must still go around it.
    const tomorrow = startOfLocalDay(now, TZ, 1)
    const shift = await trpcMutation<PlanItem>(request, 'planItems.create', {
      kind: 'commitment',
      title: 'Cafe shift',
      subtype: 'shift',
      starts_at: new Date(atLocal(tomorrow, 9)).toISOString(),
      ends_at: new Date(atLocal(tomorrow, 12)).toISOString(),
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
    // Record what the transcript shows on the way, as the jobs run.
    await transcript.evaluate((el) => {
      const seen = new Set<string>()
      ;(window as unknown as { transcriptStates: Set<string> }).transcriptStates = seen
      new MutationObserver(() => {
        const text = el.textContent ?? ''
        if (text.includes('Transcribing your lecture...')) seen.add('transcribing')
        if (text.includes('Writing your summary...')) seen.add('summarising')
        if (/\b0 segments/.test(text)) seen.add('empty')
      }).observe(el, { subtree: true, childList: true, characterData: true })
    })
    await audio.pickFile(FIXTURE)
    await audio.submitUpload({ title, course: 'Biology' })
    await expect(transcript.getByText(title)).toBeVisible({ timeout: 10000 })
    await expect(transcript.getByText('6 segments')).toBeVisible({ timeout: 20000 })
    // The summary shows one line; More opens all three.
    const summary = transcript.getByRole('region', { name: 'Lecture summary' })
    await expect(summary.getByTestId('summary-line')).toBeVisible({ timeout: 20000 })
    await summary.getByRole('button', { name: 'More' }).click()
    await expect(summary.getByRole('listitem')).toHaveCount(3)
    await expect(summary).toContainText(/mitochondrial DNA/i)
    // The summary job waits for the job runner's next pass, so its note always
    // shows; the transcript note can be too quick to catch. Never a blank "0 segments".
    const states = await page.evaluate(() => [...(window as unknown as { transcriptStates: Set<string> }).transcriptStates])
    expect(states).toContain('summarising')
    expect(states).not.toContain('empty')
    await expect(transcript.getByTestId('summarising')).toHaveCount(0)

    const recording = (await trpcQuery<Recording[]>(request, 'recordings.list')).find((r) => r.title === title)!
    const reviewsOf = async () => (await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
      sourceType: 'recording', sourceId: recording.id, kinds: ['task'],
    }))

    // 2. Mark the maternal-inheritance moment as confusing.
    await transcript.getByText(/This is what we call maternal inheritance/).click()
    const markedFrom = Date.now()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const chip = transcript.getByTestId('review-chip')
    await expect(chip).toContainText('Review planned', { timeout: 15000 })
    const markedTo = Date.now()
    await expect(chip).toContainText('20 min')
    // A 24-hour time, like the rest of the app ("Review planned · Tomorrow 11:15 · 20 min").
    await expect(chip).toHaveText(/^Review planned · \S.* \d{2}:\d{2} · 20 min$/)

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
    // At least an hour after the mark, from 09:00, within 3 days, clear of the shift (and its buffer).
    expect(start).toBeGreaterThanOrEqual(markedFrom + 60 * MIN)
    expect(wallClock(start, TZ).hour).toBeGreaterThanOrEqual(9)
    expect(end).toBeLessThanOrEqual(startOfLocalDay(now, TZ, 4))
    expect(end <= Date.parse(shift.starts_at!) - 10 * MIN || start >= Date.parse(shift.ends_at!) + 10 * MIN).toBe(true)
    // ...and the earliest such time around everything else on the calendar.
    const expected = await expectedReviewSlots(
      request,
      { id: review.id, durationMin: 20, latest: startOfLocalDay(markedFrom, TZ, 4) },
      { from: markedFrom, to: markedTo },
      TZ,
    )
    expect(expected.map((slot) => slot?.start)).toContain(start)
    const chipBefore = await chip.textContent()

    // The review is on the To-do list, linked back to the moment it came from.
    await expect(todo.getByText('Review: maternal inheritance')).toBeVisible()
    await expect(todo.getByRole('button', { name: `From ${title} · 1:35` })).toBeVisible()

    // 3. Edit the automation in the Transcript widget: 30 min, by tomorrow.
    await transcript.locator('[data-testid^="panel-automations-"]').click()
    const dialog = page.getByRole('dialog', { name: 'Automations · Transcript' })
    const sentence = dialog.getByTestId('review-automation-sentence')
    await expect(sentence).toContainText('When I mark something')
    await sentence.getByLabel('Review length in minutes').selectOption('30')
    // Earlier journeys mark moments too, so this may move more than our review.
    await expect(sentence).toContainText(/Moved \d+ reviews? to fit/)
    // Earliest placement: "by tomorrow" usually moves nothing (it is already that soon).
    await sentence.getByLabel('When the review should happen by').selectOption({ label: 'by tomorrow' })
    await expect(sentence).toContainText(/^.*Saved\. (Moved \d+ reviews? to fit\.|New reviews will follow this\.)$/)
    await dialog.getByRole('button', { name: /close/i }).click()
    await expect(dialog).toBeHidden()

    // The review is now 30 minutes, by the end of tomorrow, still an hour after the mark.
    await expect(chip).toContainText('30 min')
    await expect(chip).not.toHaveText(chipBefore!)
    const [moved] = await reviewsOf()
    expect(moved.id).toBe(review.id)
    expect(Date.parse(moved.ends_at!) - Date.parse(moved.starts_at!)).toBe(30 * MIN)
    expect(Date.parse(moved.starts_at!)).toBeGreaterThanOrEqual(Date.parse(review.created_at) + 60 * MIN)
    expect(Date.parse(moved.ends_at!)).toBeLessThanOrEqual(startOfLocalDay(now, TZ, 2))

    // The shift never moves.
    const [shiftAfter] = await trpcQuery<PlanItem[]>(request, 'planItems.list', { kinds: ['commitment'] })
      .then((items) => items.filter((i) => i.id === shift.id))
    expect(shiftAfter).toMatchObject({ starts_at: shift.starts_at, ends_at: shift.ends_at })
  })
})
