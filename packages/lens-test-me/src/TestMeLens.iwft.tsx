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
  await expect(page.getByText('Reveal Answer')).toBeVisible()
})

test('reveals answer on click', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TestMeLens {...reviewProps} />
    </TestProviders>,
  )

  await page.getByText('Reveal Answer').click()
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

  await expect(page.getByText('Exam Mode')).toBeVisible()
  await expect(page.getByText('2:00')).toBeVisible()
})
