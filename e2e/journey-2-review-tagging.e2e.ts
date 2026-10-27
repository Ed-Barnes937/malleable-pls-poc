import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom } from './pom'

test.describe('Journey: Evening review with tagging', () => {
  test('tagging a segment as confused adds a moment to review in Your Progress', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to "Evening Review" (default is In Lecture)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.expectActiveWorkspace('Evening Review')
    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('Your Progress')

    const transcriptPanel = grid.panelByLabel('Transcript')
    const weeklyPanel = grid.panelByLabel('Your Progress')

    // Wait for transcript segments to load
    await expect(transcriptPanel.getByText('14 segments')).toBeVisible({ timeout: 10000 })

    // Evening Review is a Biology board, so only the 5 biology moments to
    // review count (chemistry's 1 is left out).
    await expect(weeklyPanel.getByText('5 moments to review')).toBeVisible({ timeout: 10000 })

    // Find an untagged segment and click it to select
    // seg-bio4-01: "Today we're continuing our discussion of mitochondria..."
    const segment = transcriptPanel.getByText(/Today we're continuing our discussion/)
    await segment.click()

    // In review mode, tag buttons appear in a footer toolbar
    const confusedButton = transcriptPanel.getByRole('button', { name: 'confused', exact: true })
    await expect(confusedButton).toBeVisible()
    await confusedButton.click()

    // Verify the confused tag pill appears on the segment
    await expect(transcriptPanel.locator('text=confused').first()).toBeVisible()

    // One more biology moment to review
    await expect(weeklyPanel.getByText('6 moments to review')).toBeVisible({ timeout: 10000 })
  })
})
