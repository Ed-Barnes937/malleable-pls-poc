import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import { MomentHarness } from '../../../playwright/moment-harness'
import WeakestTopicsLens from './WeakestTopicsLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: {},
  config: {},
}

test('lists the moments to review, weakest first, with readable labels and where they are', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeakestTopicsLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('6 to review')).toBeVisible()
  const rows = page.getByTestId('weak-topic')
  await expect(rows).toHaveCount(6)
  const second = rows.nth(1)
  await expect(second).toContainText('Maternal inheritance')
  await expect(second).toContainText('Mitochondrial DNA · 9:00')
  await expect(second).toContainText('25% sure')
  await expect(second).toContainText('biology')
  await expect(page.getByText('Week 1')).toHaveCount(0)
})

test('when there are more to review than it lists, it says so with the true total', async ({ mount, page, simulator }) => {
  for (const seg of ['seg-bio1-01', 'seg-bio1-03', 'seg-bio1-04', 'seg-chem1-01']) {
    simulator.db.tags.push({ id: `tag-${seg}`, target_type: 'transcript_segment', target_id: seg, label: 'confused', created_at: '2026-04-20T10:00:00Z' })
  }
  await mount(
    <TestProviders>
      <WeakestTopicsLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('Weakest 8 of 10 to review')).toBeVisible()
  await expect(page.getByTestId('weak-topic')).toHaveCount(8)
})

test('a course-filtered board ranks only that course', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeakestTopicsLens {...defaultProps} scope={{ courseTag: 'chemistry' }} />
    </TestProviders>,
  )

  await expect(page.getByTestId('weak-topic')).toHaveCount(1)
  await expect(page.getByText('Organic Reactions · 9:00')).toBeVisible()
  await expect(page.getByText('+5 in other courses')).toBeVisible()
})

test('clicking a topic shows its lecture moment', async ({ mount, page, simulator }) => {
  await mount(<MomentHarness lens="weakest-topics" />)

  await page.getByRole('button', { name: /^Maternal inheritance: go to this moment/ }).click()
  await expect(page.getByTestId('moment-calls').getByRole('listitem')).toHaveText(['rec-bio-4@540000'])
  await expect(page.getByTestId('weak-topic-moment')).toHaveCount(0)
})

test('on a board without a Transcript it offers one that has it', async ({ mount, page, simulator }) => {
  await mount(<MomentHarness lens="weakest-topics" result="no-viewer" />)

  await page.getByRole('button', { name: /^Maternal inheritance: go to this moment/ }).click()
  await expect(page.getByText('This board has no Transcript.')).toBeVisible()
  await page.getByRole('button', { name: 'Open in a board with Transcript' }).click()
  await expect(page.getByTestId('moment-calls').getByRole('listitem')).toHaveText(['rec-bio-4@540000', 'rec-bio-4@540000 elsewhere'])
  await expect(page.getByText('This board has no Transcript.')).toHaveCount(0)
})
