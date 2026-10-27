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

  await expect(page.getByText('How your courses compare')).toBeVisible()
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

test('highlights the board course without hiding the others', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <GapAnalysisLens {...defaultProps} highlight={{ courseTag: 'biology' }} />
    </TestProviders>,
  )

  const rows = page.getByTestId('gap-course-row')
  await expect(rows).toHaveCount(2)
  await expect(page.locator('[data-course="biology"]')).toHaveAttribute('data-highlighted', 'true')
  await expect(page.locator('[data-course="chemistry"]')).toBeVisible()
  await expect(page.locator('[data-course="chemistry"]')).not.toHaveAttribute('data-highlighted')
})

test('highlights nothing when the board has no course', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <GapAnalysisLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByTestId('gap-course-row')).toHaveCount(2)
  await expect(page.locator('[data-highlighted]')).toHaveCount(0)
})
