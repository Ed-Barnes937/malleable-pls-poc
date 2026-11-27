import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import TestMeLens from './TestMeLens'

const reviewProps = {
  panelId: 'test-panel',
  scope: {},
  config: { mode: 'review' },
}

test('renders a question in review mode', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} />
    </TestProviders>,
  )

  await expect(page.getByText('Review')).toBeVisible()
  await expect(page.getByPlaceholder('Type your answer...')).toBeVisible()
  await expect(page.getByText('Reveal answer')).toBeVisible()
})

test('reveals answer on click', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} />
    </TestProviders>,
  )

  await page.getByText('Reveal answer').click()
  await expect(page.getByText('Answer')).toBeVisible()
  await expect(page.getByText('Got it')).toBeVisible()
  await expect(page.getByText("Didn't get it")).toBeVisible()
})

test('shows timer in exam mode', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TestMeLens
        panelId="test-panel"
        scope={{}}
        config={{ mode: 'exam', timerSeconds: 120 }}
      />
    </TestProviders>,
  )

  await expect(page.getByText('Exam mode')).toBeVisible()
  await expect(page.getByText('2:00')).toBeVisible()
})

test('a course-filtered board only asks questions from that course', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} scope={{ courseTag: 'chemistry' }} />
    </TestProviders>,
  )

  // Two of the fixture questions come from the chemistry lecture.
  await expect(page.getByText('1/2')).toBeVisible()
  await expect(page.getByText('+13 in other courses')).toBeVisible()
})

const sn1 = { segmentId: 'seg-chem1-04', recordingId: 'rec-chem-1', recordingTitle: 'Organic Reactions', offsetMs: 540000, label: 'SN1 and SN2' }
const tagsOn = (simulator: { db: { tags: { target_id: string; label: string }[] } }, segmentId: string) =>
  simulator.db.tags.filter((t) => t.target_id === segmentId).map((t) => t.label).sort()

test('"Got it" on a confusing moment asks "Mark sorted?", and Mark sorted sorts it with Undo', async ({ mount, page, simulator }) => {
  const notices: { message: string; action?: { label: string } }[] = []
  await mount(
    <TestProviders>
      {/* seg-chem1-04 (the SN1 question) is seeded as confused, so it comes first. */}
      <TestMeLens {...reviewProps} scope={{ courseTag: 'chemistry' }} onNotify={(n) => { notices.push(n) }} />
    </TestProviders>,
  )
  await expect(page.getByText('What is the key difference between SN1 and SN2 reactions?')).toBeVisible()
  await expect(page.getByText('You marked this confusing')).toBeVisible()
  await page.getByText('Reveal answer').click()
  await page.getByRole('button', { name: 'Got it' }).click()
  const ask = page.getByTestId('ask-sorted')
  await expect(ask.getByText('Mark sorted?')).toBeVisible()
  await ask.getByRole('button', { name: 'Mark sorted' }).click()
  await expect(ask).toHaveCount(0)
  await expect.poll(() => tagsOn(simulator, 'seg-chem1-04')).toEqual(['confused', 'sorted'])
  await expect.poll(() => notices.map((n) => [n.message, n.action?.label])).toEqual([['Marked sorted', 'Undo']])
})

test('"Not yet" moves on and leaves the moment confusing', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} scope={{ courseTag: 'chemistry' }} />
    </TestProviders>,
  )
  await page.getByText('Reveal answer').click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByTestId('ask-sorted').getByRole('button', { name: 'Not yet' }).click()
  await expect(page.getByText('2/2')).toBeVisible()
  expect(tagsOn(simulator, 'seg-chem1-04')).toEqual(['confused'])
})

test('a focused review goes through just the moments it was given, then says it is done', async ({ mount, page, simulator }) => {
  const started: number[] = []
  const look = { segmentId: 'seg-bio4-03', recordingId: 'rec-bio-4', recordingTitle: 'Biology Lecture: Mitochondrial DNA', offsetMs: 360000, label: 'Endosymbiosis' }
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} reviewRun={{ id: 7, moments: [sn1, look] }} onReviewStarted={(id) => { started.push(id) }} />
    </TestProviders>,
  )
  await expect(page.getByTestId('review-run-header')).toHaveText('Moments to review · 1 of 2')
  await expect.poll(() => started).toEqual([7])
  await expect(page.getByText('What is the key difference between SN1 and SN2 reactions?')).toBeVisible()
  await page.getByText('Reveal answer').click()
  await page.getByRole('button', { name: "Didn't get it" }).click()

  // A moment with no written question: look at it again, then say how it went.
  await expect(page.getByTestId('review-run-header')).toHaveText('Moments to review · 2 of 2')
  await expect(page.getByText('Look again: Endosymbiosis')).toBeVisible()
  await expect(page.getByTestId('look-again-hint')).toHaveText('Open it, then say how it went.')
  await page.getByRole('button', { name: 'Got it' }).click()

  await expect(page.getByTestId('review-run-done')).toContainText('You went through 2 moments.')
  await page.getByRole('button', { name: 'Back to Test Me' }).click()
  await expect(page.getByText('Review', { exact: true })).toBeVisible()
})

test('"Didn\'t get it" on a sorted moment takes the sorted mark off', async ({ mount, page, simulator }) => {
  simulator.db.tags.push({ id: 'tag-sorted', target_type: 'transcript_segment', target_id: 'seg-chem1-04', label: 'sorted', created_at: '2026-04-20T10:00:00Z' })
  const notices: { message: string }[] = []
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} reviewRun={{ id: 1, moments: [sn1] }} onNotify={(n) => { notices.push(n) }} />
    </TestProviders>,
  )
  await expect(page.getByTestId('test-me-sorted')).toBeVisible()
  await expect(page.getByText('You marked this confusing')).toHaveCount(0)
  await page.getByText('Reveal answer').click()
  await page.getByRole('button', { name: "Didn't get it" }).click()
  await expect.poll(() => tagsOn(simulator, 'seg-chem1-04')).toEqual(['confused'])
  await expect.poll(() => notices.map((n) => n.message)).toEqual(['Back on your moments to review'])
})

test('a sorted moment counts as solid in the queue, however low its rating', async ({ mount, page, simulator }) => {
  // The SN1 moment (seeded confused) is sorted and was last rated very low.
  simulator.db.tags.push({ id: 'tag-sorted', target_type: 'transcript_segment', target_id: 'seg-chem1-04', label: 'sorted', created_at: '2026-04-20T10:00:00Z' })
  simulator.db.confidenceSignals.push({ id: 'cs-low', target_type: 'transcript_segment', target_id: 'seg-chem1-04', score: 10, source_lens_id: 'test-me', created_at: '2026-04-21T10:00:00Z', decay_curve: null })
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} scope={{ courseTag: 'chemistry' }} />
    </TestProviders>,
  )
  // The never-rated question comes first.
  await expect(page.getByText("What is Zaitsev's rule?")).toBeVisible()
  await expect(page.getByText('1/2')).toBeVisible()
})

test('after "Mark sorted" the next question is the one that was next, even though the queue reorders', async ({ mount, page, simulator }) => {
  // Both chemistry moments confusing: SN1 (rated 50) first, then Zaitsev (never rated).
  simulator.db.tags.push({ id: 'tag-z', target_type: 'transcript_segment', target_id: 'seg-chem1-07', label: 'confused', created_at: '2026-04-20T10:00:00Z' })
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} scope={{ courseTag: 'chemistry' }} />
    </TestProviders>,
  )
  await expect(page.getByText('What is the key difference between SN1 and SN2 reactions?')).toBeVisible()
  await page.getByText('Reveal answer').click()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByTestId('ask-sorted').getByRole('button', { name: 'Mark sorted' }).click()
  await expect.poll(() => tagsOn(simulator, 'seg-chem1-04')).toEqual(['confused', 'sorted'])
  // Sorting moved SN1 behind Zaitsev; Zaitsev is still the one shown.
  await expect(page.getByText("What is Zaitsev's rule?")).toBeVisible()
  await expect(page.getByText('1/2')).toBeVisible()
})

test('a sort that fails says so, and the run does not count it', async ({ mount, page, simulator }) => {
  // A confusing moment whose lecture part has gone: the server refuses to sort it.
  simulator.db.tags.push({ id: 'tag-gone', target_type: 'transcript_segment', target_id: 'seg-gone', label: 'confused', created_at: '2026-04-20T10:00:00Z' })
  const gone = { segmentId: 'seg-gone', recordingId: 'rec-gone', recordingTitle: 'Gone', offsetMs: 0, label: 'Something gone' }
  const notices: { message: string; tone?: string }[] = []
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} reviewRun={{ id: 3, moments: [gone] }} onNotify={(n) => { notices.push(n) }} />
    </TestProviders>,
  )
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.getByTestId('ask-sorted').getByRole('button', { name: 'Mark sorted' }).click()
  await expect.poll(() => notices).toEqual([{ message: "Couldn't mark it sorted. Try again.", tone: 'error', key: 'marks-seg-gone' }])
  await expect(page.getByTestId('review-run-done')).toContainText('You went through 1 moment.')
  expect(tagsOn(simulator, 'seg-gone')).toEqual(['confused'])
})

test('in exam mode the timer starts again on each card of a focused review', async ({ mount, page, simulator }) => {
  await page.clock.install()
  const look = { segmentId: 'seg-bio4-03', recordingId: 'rec-bio-4', recordingTitle: 'Biology Lecture: Mitochondrial DNA', offsetMs: 360000, label: 'Endosymbiosis' }
  await mount(
    <TestProviders>
      <TestMeLens panelId="test-panel" scope={{}} config={{ mode: 'exam', timerSeconds: 120 }} reviewRun={{ id: 4, moments: [sn1, look] }} />
    </TestProviders>,
  )
  await expect(page.getByText('2:00')).toBeVisible()
  await page.clock.runFor(5000)
  await expect(page.getByText('1:55')).toBeVisible()
  await page.getByText('Reveal answer').click()
  await page.getByRole('button', { name: "Didn't get it" }).click()
  await expect(page.getByTestId('review-run-header')).toHaveText('Moments to review · 2 of 2')
  await expect(page.getByText('2:00')).toBeVisible()
})
