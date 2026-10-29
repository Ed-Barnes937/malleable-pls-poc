import { test, expect, type Locator } from '@playwright/test'
import { TopBarPom, PanelGridPom } from './pom'

/** True when `el` is drawn whole inside its widget's content area, with no scrolling. */
async function shownWhole(panel: Locator, el: Locator): Promise<boolean> {
  const area = await panel.getByTestId('panel-content').boundingBox()
  const box = await el.boundingBox()
  return !!area && !!box && box.y >= area.y && box.y + box.height <= area.y + area.height
}

test.describe('Journey: Exam prep drill', () => {
  test('the seeded board shows each widget whole at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Exam Prep')

    const testMe = grid.panelByLabel('Test Me')
    const reveal = testMe.getByRole('button', { name: 'Reveal answer' })
    await expect(reveal).toBeVisible({ timeout: 10000 })
    expect(await shownWhole(testMe, reveal)).toBe(true)

    const weakest = grid.panelByLabel('Weakest Topics')
    const topics = weakest.getByTestId('weak-topic')
    // Earlier journeys can add topics, so only the top four (what showed
    // before the redesign) must fit; the rest scroll.
    await expect(topics.nth(3)).toBeVisible({ timeout: 10000 })
    for (const topic of (await topics.all()).slice(0, 4)) expect(await shownWhole(weakest, topic)).toBe(true)
  })

  test('answering wrong in TestMe advances question and updates confidence', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to Exam Prep
    await topBar.switchToWorkspace('Exam Prep')
    await topBar.expectActiveWorkspace('Exam Prep')

    await grid.expectHasPanel('All Courses')
    await grid.expectHasPanel('Weakest Topics')
    await grid.expectHasPanel('Test Me')

    const testMePanel = grid.panelByLabel('Test Me')
    const weakestPanel = grid.panelByLabel('Weakest Topics')

    // TestMe should show exam mode with timer
    await expect(testMePanel.getByText('Exam mode')).toBeVisible({ timeout: 10000 })
    await expect(testMePanel.getByText('2:00')).toBeVisible()

    // Read the initial question counter (should be "1/N")
    await expect(testMePanel.getByText(/^1\//)).toBeVisible()

    // Note the initial confidence % of the #1 weakest topic
    const confidenceValues = weakestPanel.getByTestId('weak-topic-sureness')
    await expect(confidenceValues.first()).toBeVisible({ timeout: 10000 })
    const initialConfidence = await confidenceValues.first().textContent()

    // Reveal the answer
    await testMePanel.getByText('Reveal answer').click()
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
