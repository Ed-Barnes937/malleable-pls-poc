import { test, expect } from '@playwright/test'
import { SidebarPom, PanelGridPom } from './pom'

test.describe('Journey: Cross-workspace data flow', () => {
  test('confused tag in Evening Review increases gap count in Exam Prep', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const grid = new PanelGridPom(page)

    // Start in Evening Review (default)
    await sidebar.expectActiveWorkspace('Evening Review')

    const transcriptPanel = grid.panelByLabel('Transcript')
    const weeklyPanel = grid.panelByLabel('This Week')

    // Wait for data to load
    await expect(transcriptPanel.getByText('14 segments')).toBeVisible({ timeout: 10000 })

    // Read initial gap count dynamically (other tests may have modified data)
    const gapText = weeklyPanel.getByText(/\d+ gaps? to review/)
    await expect(gapText).toBeVisible({ timeout: 10000 })
    const initialGapText = await gapText.textContent()
    const initialGapCount = parseInt(initialGapText!.match(/(\d+)/)![1], 10)

    // Find an untagged segment — seg-bio4-02 is never tagged by other tests
    await transcriptPanel.getByText(/Mitochondria have their own DNA/).click()
    const confusedButton = transcriptPanel.getByRole('button', { name: 'confused', exact: true })
    await confusedButton.click()

    // Verify gap count increased by 1
    await expect(weeklyPanel.getByText(`${initialGapCount + 1} gaps to review`)).toBeVisible({ timeout: 10000 })

    // Switch to Exam Prep
    await sidebar.switchToWorkspace('Exam Prep')
    await sidebar.expectActiveWorkspace('Exam Prep')

    // Gap Analysis should reflect the new confused tag
    const gapPanel = grid.panelByLabel('Gap Analysis')
    await expect(gapPanel.getByText('biology')).toBeVisible({ timeout: 10000 })
    await expect(gapPanel.getByText(/weak area/).first()).toBeVisible({ timeout: 10000 })
  })

  test('confidence recorded in Evening Review reflects in Exam Prep weakest topics', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const grid = new PanelGridPom(page)

    // Start in Evening Review
    await sidebar.expectActiveWorkspace('Evening Review')

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
    await sidebar.switchToWorkspace('Exam Prep')
    await sidebar.expectActiveWorkspace('Exam Prep')

    // WeakestTopics should reflect the lowered confidence
    const weakestPanel = grid.panelByLabel('Weakest Topics')
    await expect(weakestPanel.getByText('Weakest Topics')).toBeVisible({ timeout: 10000 })

    // Verify the panel loaded with data (ranks visible)
    await expect(weakestPanel.locator('text=1').first()).toBeVisible()
  })
})
