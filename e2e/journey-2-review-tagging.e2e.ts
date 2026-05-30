import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom } from './pom'

test.describe('Journey: Evening review with tagging', () => {
  test('tagging a segment as confused updates the weekly overview gap count', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Default workspace is "Evening Review"
    await topBar.expectActiveWorkspace('Evening Review')
    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('This Week')

    const transcriptPanel = grid.panelByLabel('Transcript')
    const weeklyPanel = grid.panelByLabel('This Week')

    // Wait for transcript segments to load
    await expect(transcriptPanel.getByText('14 segments')).toBeVisible({ timeout: 10000 })

    // Verify initial gap count in WeeklyOverview (3 biology + 1 chemistry = 4 total)
    await expect(weeklyPanel.getByText('4 gaps to review')).toBeVisible({ timeout: 10000 })

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

    // WeeklyOverview should update to show 5 gaps (one more biology gap)
    await expect(weeklyPanel.getByText('5 gaps to review')).toBeVisible({ timeout: 10000 })
  })
})
