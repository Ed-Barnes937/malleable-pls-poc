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
    source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000,
    created_at: '2026-04-16T10:12:00Z', updated_at: '2026-04-16T10:12:00Z',
  })
  await mount(
    <TestProviders>
      <TranscriptLens {...defaultProps} />
    </TestProviders>,
  )

  const summary = page.getByRole('region', { name: 'Lecture summary' })
  await expect(summary.getByRole('listitem')).toHaveText([
    'Mitochondria carry their own DNA.',
    'It is passed down the maternal line.',
    'Know two mitochondrial diseases.',
  ])
  const chip = page.getByTestId('review-chip')
  await expect(chip).toHaveCount(1)
  // 24-hour en-GB times, like every other widget.
  await expect(chip).toHaveText('Review planned Wed 22 Apr 19:40 · 20 min')
  await expect(chip).toHaveAttribute('title', 'Review: maternal inheritance')
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
