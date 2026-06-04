import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom, PanelContainerPom } from './pom'

test.describe('Panel management', () => {
  test('panels are visible for the default workspace', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Default workspace is In Lecture (store initialises to ws-in-lecture)
    await topBar.expectActiveWorkspace('In Lecture')
    await grid.expectPanelCount(2)
    await grid.expectHasPanel('Audio Capture')
    await grid.expectHasPanel('Transcript')
  })

  test('removing a panel updates the canvas', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    await topBar.switchToWorkspace('Evening Review')
    await grid.expectPanelCount(4)

    // Remove the Connections panel
    const targetPanel = grid.panelByLabel('Connections')
    const container = new PanelContainerPom(targetPanel)
    await container.remove()

    await grid.expectPanelCount(3)
    await expect(grid.panelByLabel('Connections')).toBeHidden()
  })
})
