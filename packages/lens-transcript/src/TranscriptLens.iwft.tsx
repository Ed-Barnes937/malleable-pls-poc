import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import TranscriptLens from './TranscriptLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: {},
  config: { recordingId: 'rec-bio-4', mode: 'review' },
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

test('shows empty state when no recording selected', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TranscriptLens panelId="test" scope={{}} config={{}} />
    </TestProviders>,
  )

  await expect(page.getByText('Select a recording to view transcript')).toBeVisible()
})
