import { test, expect } from '@playwright/test'
import { SidebarPom, PanelGridPom } from './pom'

test.describe('Journey: Exam prep drill', () => {
  test('answering wrong in TestMe advances question and updates confidence', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to Exam Prep
    await sidebar.switchToWorkspace('Exam Prep')
    await sidebar.expectActiveWorkspace('Exam Prep')

    await grid.expectHasPanel('Gap Analysis')
    await grid.expectHasPanel('Weakest Topics')
    await grid.expectHasPanel('Test Me')

    const testMePanel = grid.panelByLabel('Test Me')
    const weakestPanel = grid.panelByLabel('Weakest Topics')

    // TestMe should show exam mode with timer
    await expect(testMePanel.getByText('Exam Mode')).toBeVisible({ timeout: 10000 })
    await expect(testMePanel.getByText('2:00')).toBeVisible()

    // Read the initial question counter (should be "1/N")
    await expect(testMePanel.getByText(/^1\//)).toBeVisible()

    // Note the initial confidence % of the #1 weakest topic
    const confidenceValues = weakestPanel.locator('.font-mono.tabular-nums')
    await expect(confidenceValues.first()).toBeVisible({ timeout: 10000 })
    const initialConfidence = await confidenceValues.first().textContent()

    // Reveal the answer
    await testMePanel.getByText('Reveal Answer').click()
    await expect(testMePanel.getByText('Answer')).toBeVisible()

    // Mark it wrong
    await testMePanel.getByText("Didn't get it").click()

    // Question should advance to 2/N
    await expect(testMePanel.getByText(/^2\//)).toBeVisible()

    // WeakestTopics confidence should update after aggregate invalidation
    await expect(async () => {
      const currentConfidence = await confidenceValues.first().textContent()
      expect(currentConfidence).not.toBe(initialConfidence)
    }).toPass({ timeout: 10000 })
  })
})
