import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom } from './pom'

test.describe('Journey: Cross-workspace data flow', () => {
  test('confused tag in Evening Review adds a moment to review, also in Exam Prep', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to Evening Review (default is In Lecture)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.expectActiveWorkspace('Evening Review')

    const transcriptPanel = grid.panelByLabel('Transcript')
    const weeklyPanel = grid.panelByLabel('Your Progress')

    // Wait for data to load
    await expect(transcriptPanel.getByText('14 segments')).toBeVisible({ timeout: 10000 })

    // Read the initial count dynamically (other tests may have modified data)
    const gapText = weeklyPanel.getByText(/\d+ moments? to review/)
    await expect(gapText).toBeVisible({ timeout: 10000 })
    const initialGapText = await gapText.textContent()
    const initialGapCount = parseInt(initialGapText!.match(/(\d+)/)![1], 10)

    // Find an untagged segment — seg-bio4-02 is never tagged by other tests
    await transcriptPanel.getByText(/Mitochondria have their own DNA/).click()
    const confusedButton = transcriptPanel.getByRole('button', { name: 'confused', exact: true })
    await confusedButton.click()

    // One more moment to review
    await expect(weeklyPanel.getByText(`${initialGapCount + 1} moments to review`)).toBeVisible({ timeout: 10000 })

    // Switch to Exam Prep
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.expectActiveWorkspace('Exam Prep')

    // All Courses counts the same moments to review as Your Progress did (the
    // Evening Review board is Biology, so its total is Biology's).
    const gapPanel = grid.panelByLabel('All Courses')
    await expect(gapPanel.locator('[data-course="biology"]').getByText(`${initialGapCount + 1} to review`)).toBeVisible({ timeout: 10000 })
  })

  test('confidence recorded in Evening Review reflects in Exam Prep weakest topics', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to Evening Review (default is In Lecture)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.expectActiveWorkspace('Evening Review')

    const testMePanel = grid.panelByLabel('Test Me')

    // TestMe in Evening Review is in review mode
    await expect(testMePanel.getByText('Review')).toBeVisible({ timeout: 10000 })
    await expect(testMePanel.getByText('Reveal Answer')).toBeVisible()

    // Answer wrong to lower confidence
    await testMePanel.getByText('Reveal Answer').click()
    await testMePanel.getByText("Didn't get it").click()

    // Question should advance
    await expect(testMePanel.getByText(/^2\//)).toBeVisible()

    // Switch to Exam Prep
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.expectActiveWorkspace('Exam Prep')

    // Weakest Topics reflects the lowered confidence: the first question (the
    // least sure confusing moment, 20%) dropped to 0%.
    const weakestPanel = grid.panelByLabel('Weakest Topics')
    await expect(weakestPanel.getByText(/\d+ to review/)).toBeVisible({ timeout: 10000 })
    await expect(weakestPanel.getByTestId('weak-topic').filter({ hasText: '0% sure' }).first()).toBeVisible({ timeout: 10000 })
  })
})
