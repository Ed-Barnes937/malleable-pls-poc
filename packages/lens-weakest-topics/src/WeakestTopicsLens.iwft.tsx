import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import WeakestTopicsLens from './WeakestTopicsLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: {},
  config: {},
}

test('renders ranked list of weakest topics', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeakestTopicsLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByText('Weakest Topics')).toBeVisible()
  // Should show rank numbers
  await expect(page.locator('text=1').first()).toBeVisible()
  await expect(page.locator('text=2').first()).toBeVisible()
})

test('shows course badges', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <WeakestTopicsLens {...defaultProps} />
    </TestProviders>,
  )

  // Should show biology and/or chemistry course badges
  await expect(page.getByText('biology').first()).toBeVisible()
})
