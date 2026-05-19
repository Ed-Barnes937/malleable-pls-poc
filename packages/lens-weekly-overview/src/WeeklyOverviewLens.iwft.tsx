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
  await expect(page.getByText('This Week')).toBeVisible()
})

test('shows gap count', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeeklyOverviewLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText(/gaps? to review/)).toBeVisible()
})
