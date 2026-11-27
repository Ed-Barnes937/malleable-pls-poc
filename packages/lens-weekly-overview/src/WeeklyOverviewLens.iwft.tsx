import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import WeeklyOverviewLens from './WeeklyOverviewLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: {},
  config: {},
}

test('renders course overview with percentages', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeeklyOverviewLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('biology')).toBeVisible()
  await expect(page.getByText('chemistry')).toBeVisible()
  await expect(page.getByText('You feel sure about 7 of 54 moments so far')).toBeVisible()
})

test('shows how many moments to review', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeeklyOverviewLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('6 moments to review')).toBeVisible()
  await expect(page.locator('[data-course="biology"]').getByText('5 to review')).toBeVisible()
})

test('the to-review chip starts a focused review of just those moments', async ({ mount, page, simulator }) => {
  const runs: { segmentId: string }[][] = []
  await mount(
    <TestProviders>
      <WeeklyOverviewLens {...defaultProps} onStartReview={(moments) => { runs.push(moments) }} />
    </TestProviders>,
  )
  await page.getByRole('button', { name: '6 moments to review' }).click()
  await expect.poll(() => runs.length).toBe(1)
  expect(runs[0]).toHaveLength(6)
  expect(runs[0][0]).toEqual(expect.objectContaining({ segmentId: expect.any(String), recordingId: expect.any(String), offsetMs: expect.any(Number), label: expect.any(String) }))
})

test('a sorted moment no longer counts as one to review', async ({ mount, page, simulator }) => {
  // seg-bio4-04 is seeded as confused.
  simulator.db.tags.push({ id: 'tag-sorted', target_type: 'transcript_segment', target_id: 'seg-bio4-04', label: 'sorted', created_at: '2026-04-20T10:00:00Z' })
  await mount(
    <TestProviders>
      <WeeklyOverviewLens {...defaultProps} />
    </TestProviders>,
  )
  await expect(page.getByText('5 moments to review')).toBeVisible()
  await expect(page.locator('[data-course="biology"]').getByText('4 to review')).toBeVisible()
})

test('a course-filtered board shows only that course and says what it leaves out', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeeklyOverviewLens {...defaultProps} scope={{ courseTag: 'biology' }} />
    </TestProviders>,
  )

  await expect(page.getByText('biology')).toBeVisible()
  await expect(page.getByText('chemistry')).toHaveCount(0)
  await expect(page.getByText('+1 in other courses')).toBeVisible()
})
