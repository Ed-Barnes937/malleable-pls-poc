import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom, PanelContainerPom } from './pom'

test.describe('Panel management', () => {
  test('panels are visible for the default workspace', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    await topBar.expectActiveWorkspace('Evening Review')
    await grid.expectPanelCount(4)
    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('Test Me')
    await grid.expectHasPanel('This Week')
    await grid.expectHasPanel('Connections')
  })

  test('removing a panel updates the grid', async ({ page }) => {
    await page.goto('/')
    const grid = new PanelGridPom(page)

    await grid.expectPanelCount(4)

    // Get the first panel and remove it
    const targetPanel = grid.panelByLabel('Connections')
    const container = new PanelContainerPom(targetPanel)
    await container.remove()

    await grid.expectPanelCount(3)
    await expect(grid.panelByLabel('Connections')).toBeHidden()
  })
})
