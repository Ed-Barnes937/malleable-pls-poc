import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import GapAnalysisLens from './GapAnalysisLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: {},
  config: {},
}

test('renders gap analysis for all courses', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <GapAnalysisLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('Gap Analysis — All Courses')).toBeVisible()
  await expect(page.getByText('biology')).toBeVisible()
  await expect(page.getByText('chemistry')).toBeVisible()
})

test('shows weak area counts', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <GapAnalysisLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText(/weak area/).first()).toBeVisible()
})
