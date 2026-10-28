import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import TranscriptLens from './TranscriptLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: { recordingId: 'rec-bio-4' },
  config: { mode: 'review' },
}

test('renders transcript segments for a recording', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()
  await expect(page.getByText('14 segments')).toBeVisible()
  await expect(page.getByText(/mitochondrial DNA is inherited exclusively/)).toBeVisible()
})

test('shows tags on tagged segments', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} />
    </TestProviders>,
  )

  // seg-bio4-04 has 'confused' and 'key-point' tags in seed data
  await expect(page.locator('text=confused').first()).toBeVisible()
  await expect(page.locator('text=key-point').first()).toBeVisible()
})

test('shows annotations in review mode', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('Maternal inheritance — need to understand this better')).toBeVisible()
})

test('shows the lecture summary at the top and the review a confused moment became', async ({ mount, page, simulator }) => {
  simulator.db.annotations.push({
    id: 'ann-summary', anchor_type: 'recording_summary', anchor_id: 'rec-bio-4',
    anchor_start_ms: null, anchor_end_ms: null,
    body: 'Mitochondria carry their own DNA.\nIt is passed down the maternal line.\nKnow two mitochondrial diseases.',
    created_at: '2026-04-16T11:00:00Z', author_id: 'dev-user-1',
  })
  simulator.db.planItems.push({
    id: 'pi-review', kind: 'task', title: 'Review: maternal inheritance',
    starts_at: '2026-04-22T18:40:00.000Z', ends_at: '2026-04-22T19:00:00.000Z', due_at: null,
    duration_min: 20, status: 'open', recurrence: null, subtype: 'review',
    // seg-bio4-04 starts at 540000 ms.
    source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000, created_by_workflow_id: null,
    created_at: '2026-04-16T10:12:00Z', updated_at: '2026-04-16T10:12:00Z',
  })
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} />
    </TestProviders>,
  )

  // One line until opened.
  const summary = page.getByRole('region', { name: 'Lecture summary' })
  await expect(summary.getByTestId('summary-line')).toHaveText('Mitochondria carry their own DNA.')
  await expect(summary.getByRole('listitem')).toHaveCount(0)
  const more = summary.getByRole('button', { name: 'Show summary' })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect(summary.getByRole('listitem')).toHaveText([
    'Mitochondria carry their own DNA.',
    'It is passed down the maternal line.',
    'Know two mitochondrial diseases.',
  ])
  await summary.getByRole('button', { name: 'Hide summary' }).click()
  await expect(summary.getByRole('listitem')).toHaveCount(0)

  const chip = page.getByTestId('review-chip')
  await expect(chip).toHaveCount(1)
  // 24-hour en-GB times, like every other widget.
  await expect(chip).toHaveText('Review planned · Wed 22 Apr 19:40 · 20 min')
  await expect(chip).toHaveAttribute('title', 'Review: maternal inheritance')
})

test('a long summary in a short widget leaves the transcript room to take clicks', async ({ mount, page, simulator }) => {
  simulator.db.annotations.push({
    id: 'ann-summary', anchor_type: 'recording_summary', anchor_id: 'rec-bio-4',
    anchor_start_ms: null, anchor_end_ms: null,
    body: Array.from({ length: 6 }, (_, i) => `Point ${i + 1}: mitochondria carry their own small circular genome, passed down the maternal line.`).join('\n'),
    created_at: '2026-04-16T11:00:00Z', author_id: 'dev-user-1',
  })
  await mount(
    <TestProviders>
      <div style={{ width: 420, height: 300 }}>
        <TranscriptLens {...defaultProps} />
      </div>
    </TestProviders>,
  )

  const summary = page.getByRole('region', { name: 'Lecture summary' })
  await summary.getByRole('button', { name: 'Show summary' }).click()
  await expect(summary.getByRole('listitem')).toHaveCount(6)
  // Nothing covers the first moment: it can take a click.
  await page.getByText(/continuing our discussion of mitochondria/).click({ trial: true, timeout: 3000 })
})

function jobRun(id: string, jobType: string, status: 'pending' | 'running' | 'completed', recordingId: string) {
  return {
    id, workflow_id: 'wf-test', workflow_job_id: 'wfj-test', job_type: jobType, status,
    input: JSON.stringify({ recording_id: recordingId }), output: null, error: null, depth: 0,
    created_at: '2026-04-16T10:00:00Z', started_at: null, completed_at: null,
  }
}

const newLecture = {
  id: 'rec-new', title: 'Just uploaded', created_at: '2026-04-16T10:00:00Z',
  duration: 60000, audio_url: '/uploads/rec-new.wav', status: 'uploaded',
}

test('says the lecture is being transcribed instead of showing an empty transcript', async ({ mount, page, simulator }) => {
  simulator.db.recordings.push(newLecture)
  simulator.db.jobRuns.push(jobRun('jr-t', 'ai:transcribe', 'running', 'rec-new'))
  await mount(
    <TestProviders>
      <TranscriptLens panelId="test" scope={{ recordingId: 'rec-new' }} config={{ mode: 'review' }} />
    </TestProviders>,
  )

  await expect(page.getByText('Just uploaded')).toBeVisible()
  await expect(page.getByTestId('transcribing')).toHaveText('Transcribing your lecture...')
  await expect(page.getByText(/segments/)).toHaveCount(0)

  // Once the job is done, the next refresh drops the note.
  simulator.db.jobRuns.find((j) => j.id === 'jr-t')!.status = 'completed'
  await expect(page.getByTestId('transcribing')).toHaveCount(0, { timeout: 10000 })
  await expect(page.getByText('0 segments')).toBeVisible()
})

test('says the summary is being written above the transcript', async ({ mount, page, simulator }) => {
  simulator.db.recordings.push(newLecture)
  simulator.db.transcriptSegments.push({
    id: 'seg-new-1', recording_id: 'rec-new', start_ms: 0, end_ms: 5000, text: 'Today: mitochondria.', speaker: null,
  })
  simulator.db.jobRuns.push(jobRun('jr-t', 'ai:transcribe', 'completed', 'rec-new'))
  simulator.db.jobRuns.push(jobRun('jr-s', 'ai:summarize-lecture', 'pending', 'rec-new'))
  await mount(
    <TestProviders>
      <TranscriptLens panelId="test" scope={{ recordingId: 'rec-new' }} config={{ mode: 'review' }} />
    </TestProviders>,
  )

  const summary = page.getByRole('region', { name: 'Lecture summary' })
  await expect(summary.getByTestId('summarising')).toHaveText('Writing your summary...')
  await expect(page.getByText('Today: mitochondria.')).toBeVisible()
  await expect(page.getByText('1 segments')).toBeVisible()
  await expect(page.getByTestId('transcribing')).toHaveCount(0)
})

test('shows empty state when no recording selected', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TranscriptLens panelId="test" scope={{}} config={{}} />
    </TestProviders>,
  )

  await expect(page.getByText('Pick a lecture to see its transcript')).toBeVisible()
})

test('scrolls to and highlights a moment another widget asked to show', async ({ mount, page, simulator }) => {
  // 2_200_000 ms falls in seg-bio4-13, far below the fold of a 300px panel.
  await mount(
    <TestProviders>
      <div style={{ height: 300, display: 'flex', flexDirection: 'column' }}>
        <TranscriptLens {...defaultProps} focusedMoment={{ recordingId: 'rec-bio-4', offsetMs: 2_200_000, id: 1 }} />
      </div>
    </TestProviders>,
  )

  const moment = page.locator('[data-moment]')
  await expect(moment).toHaveCount(1)
  await expect(moment).toContainText('chloroplast DNA')
  await expect(moment).toBeInViewport()
  await expect(page.locator('[aria-current="location"]')).toContainText('36:00')

  // Clicking a segment clears the highlight.
  await moment.getByRole('button').click()
  await expect(moment).toHaveCount(0)
})

test('a moment taller than the transcript shows from its first line', async ({ mount, page, simulator }) => {
  simulator.db.recordings.push({
    id: 'rec-long', title: 'Long moment', created_at: '2026-04-16T10:00:00Z',
    duration: 600000, audio_url: null, status: 'ready',
  })
  for (let i = 0; i < 12; i++) {
    const long = i === 6
    simulator.db.transcriptSegments.push({
      id: `seg-long-${i}`, recording_id: 'rec-long', start_ms: i * 30000, end_ms: (i + 1) * 30000, speaker: null,
      text: long
        ? `Now, here is the part people find tricky. ${'It keeps going, sentence after sentence, well past the fold. '.repeat(30)}`
        : `Short moment ${i}.`,
    })
  }
  await mount(
    <TestProviders>
      <div style={{ height: 300, width: 400, display: 'flex', flexDirection: 'column' }}>
        <TranscriptLens panelId="test" scope={{ recordingId: 'rec-long' }} config={{ mode: 'review' }} focusedMoment={{ recordingId: 'rec-long', offsetMs: 6 * 30000, id: 3 }} />
      </div>
    </TestProviders>,
  )

  const moment = page.locator('[data-moment]')
  await expect(moment).toContainText('Now, here is the part people find tricky')
  const opening = moment.getByText(/^Now, here is the part people find tricky/)
  // Its opening line sits at the top of the list, not scrolled past.
  await expect(async () => {
    const list = await page.locator('[data-segment-id="seg-long-0"]').evaluate((el) => el.parentElement!.getBoundingClientRect().top)
    const top = (await moment.boundingBox())!.y
    expect(top - list).toBeGreaterThanOrEqual(0)
    expect(top - list).toBeLessThan(20)
  }).toPass()
  await expect(opening).toBeInViewport()
  // (It really is taller than the list.)
  expect(await moment.evaluate((el) => el.clientHeight > el.parentElement!.clientHeight)).toBe(true)
})

test('ignores a moment from another lecture', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} focusedMoment={{ recordingId: 'rec-chem-1', offsetMs: 0, id: 2 }} />
    </TestProviders>,
  )
  await expect(page.getByText('14 segments')).toBeVisible()
  await expect(page.locator('[data-moment]')).toHaveCount(0)
})

test('a lecture focused outside the board course keeps its tags, and new tags appear', async ({ mount, page, simulator }) => {
  // Biology board, Chemistry lecture focused: the targeted lecture wins.
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} scope={{ recordingId: 'rec-chem-1', courseTag: 'biology' }} />
    </TestProviders>,
  )

  // seg-chem1-04 is seeded as confused, seg-chem1-09 as key-point.
  await expect(page.locator('text=key-point').first()).toBeVisible()
  await expect(page.getByText('SN1 vs SN2 still confusing')).toBeVisible()

  await page.getByText(/Good afternoon. Today we begin organic reactions/).click()
  const confusedButton = page.getByRole('button', { name: 'confused', exact: true })
  await expect(confusedButton).toBeVisible()
  const before = await page.locator('text=confused').count()
  await confusedButton.click()
  await expect.poll(() => simulator.db.tags.filter((t) => t.target_id === 'seg-chem1-01' && t.label === 'confused').length).toBe(1)
  // The new pill appears even though the lecture is outside the course.
  await expect(page.locator('text=confused')).toHaveCount(before + 1)
})

test('landing on a moment folds the summary to one line and outlines the moment in the lecture course', async ({ mount, page, simulator }) => {
  simulator.db.annotations.push({
    id: 'ann-summary', anchor_type: 'recording_summary', anchor_id: 'rec-bio-4',
    anchor_start_ms: null, anchor_end_ms: null,
    body: 'Mitochondria carry their own DNA.\nIt is passed down the maternal line.\nKnow two mitochondrial diseases.',
    created_at: '2026-04-16T11:00:00Z', author_id: 'dev-user-1',
  })
  // No board course and no reviews: the colours come from the lecture's own course.
  await mount(
    <TestProviders>
      <div style={{ height: 400, display: 'flex', flexDirection: 'column' }}>
        <TranscriptLens {...defaultProps} focusedMoment={{ recordingId: 'rec-bio-4', offsetMs: 540000, id: 1 }} />
      </div>
    </TestProviders>,
  )

  const moment = page.locator('[data-moment]')
  await expect(moment).toContainText('inherited exclusively from the maternal line')
  await expect(moment).toBeInViewport()
  // The moment's box (with its tags and chips) is outlined in course colour.
  await expect(moment).toHaveClass(/border-course-biology/)
  await expect(page.getByText('Biology', { exact: true })).toBeVisible()

  const summary = page.getByRole('region', { name: 'Lecture summary' })
  await expect(summary).toHaveText('Mitochondria carry their own DNA.Show summary')
  await expect(summary.getByRole('listitem')).toHaveCount(0)
  const toggle = summary.getByRole('button', { name: 'Show summary' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(summary.getByRole('listitem')).toHaveCount(3)
  // The same button folds it again, and keeps focus.
  const hide = summary.getByRole('button', { name: 'Hide summary' })
  await expect(hide).toHaveAttribute('aria-expanded', 'true')
  await expect(hide).toBeFocused()
  await hide.press('Enter')
  await expect(summary.getByRole('listitem')).toHaveCount(0)
  await expect(summary.getByRole('button', { name: 'Show summary' })).toBeFocused()
})

test('a moment shown after a board switch also takes keyboard focus', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <div style={{ height: 400, display: 'flex', flexDirection: 'column' }}>
        <TranscriptLens {...defaultProps} focusedMoment={{ recordingId: 'rec-bio-4', offsetMs: 2_200_000, id: 1, takeFocus: true }} />
      </div>
    </TestProviders>,
  )
  const moment = page.locator('[data-moment]')
  await expect(moment).toContainText('chloroplast DNA')
  await expect(moment.getByRole('button').first()).toBeFocused()
  await expect(moment).toBeInViewport()
})

test('a moment shown on the same board leaves focus where it was', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <div style={{ height: 400, display: 'flex', flexDirection: 'column' }}>
        <TranscriptLens {...defaultProps} focusedMoment={{ recordingId: 'rec-bio-4', offsetMs: 2_200_000, id: 1 }} />
      </div>
    </TestProviders>,
  )
  await expect(page.locator('[data-moment]')).toContainText('chloroplast DNA')
  await expect(page.locator('[data-moment]').getByRole('button').first()).not.toBeFocused()
})

test('the summary shows one line when nothing landed', async ({ mount, page, simulator }) => {
  simulator.db.annotations.push({
    id: 'ann-summary', anchor_type: 'recording_summary', anchor_id: 'rec-bio-4',
    anchor_start_ms: null, anchor_end_ms: null, body: 'One.\nTwo.\nThree.',
    created_at: '2026-04-16T11:00:00Z', author_id: 'dev-user-1',
  })
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} />
    </TestProviders>,
  )
  const summary = page.getByRole('region', { name: 'Lecture summary' })
  await expect(summary.getByTestId('summary-line')).toHaveText('One.')
  await expect(summary.getByRole('listitem')).toHaveCount(0)
})

test('gutter marks and a scroll rail show every tagged moment', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <div style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
        <TranscriptLens {...defaultProps} />
      </div>
    </TestProviders>,
  )

  // seg-bio4-04 is both confused and a key point: confusion leads.
  await expect(page.locator('[data-segment-id="seg-bio4-04"]').getByTestId('transcript-gutter-mark')).toHaveAttribute('data-tag', 'confused')
  await expect(page.locator('[data-segment-id="seg-bio4-12"]').getByTestId('transcript-gutter-mark')).toHaveAttribute('data-tag', 'key-point')
  await expect(page.locator('[data-segment-id="seg-bio4-05"]').getByTestId('transcript-gutter-mark')).toHaveCount(0)

  // A legend names the colours, so they don't carry meaning on their own.
  await expect(page.getByRole('list', { name: 'Tag colours' }).getByRole('listitem')).toHaveText(['Confused', 'Key point', 'Question'])

  const rail = page.getByRole('group', { name: 'Tagged moments' })
  const marks = rail.getByRole('button')
  expect(await marks.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual([
    'Confused at 9:00', 'Confused at 21:00', 'Confused at 27:00', 'Key point at 33:00',
  ])
  // Targets at least 24px, never overlapping.
  const boxes = await marks.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top, w: r.width, h: r.height })))
  for (const [i, b] of boxes.entries()) {
    expect(b.w).toBeGreaterThanOrEqual(24)
    expect(b.h).toBeGreaterThanOrEqual(24)
    if (i > 0) expect(b.top - boxes[i - 1].top).toBeGreaterThanOrEqual(24)
  }

  // Clicking a mark brings that moment into view and puts focus on it.
  const keyPoint = page.locator('[data-segment-id="seg-bio4-12"]')
  await expect(keyPoint).not.toBeInViewport()
  await rail.getByRole('button', { name: 'Key point at 33:00' }).click()
  await expect(keyPoint).toBeInViewport()
  await expect(keyPoint.getByRole('button').first()).toBeFocused()
})

test('a lecture with no course of its own falls back to the board course', async ({ mount, page, simulator }) => {
  simulator.db.recordings.push({
    id: 'rec-plain', title: 'Untitled lecture', created_at: '2026-04-16T10:00:00Z', duration: 60000, audio_url: null, status: 'ready',
  })
  simulator.db.transcriptSegments.push({ id: 'seg-plain-1', recording_id: 'rec-plain', start_ms: 0, end_ms: 5000, text: 'Hello.', speaker: null })
  await mount(
    <TestProviders>
      <TranscriptLens panelId="test" scope={{ recordingId: 'rec-plain', courseTag: 'chemistry' }} config={{ mode: 'review' }} />
    </TestProviders>,
  )
  await expect(page.getByText('Untitled lecture')).toBeVisible()
  await expect(page.getByText('Chemistry', { exact: true })).toBeVisible()
})
