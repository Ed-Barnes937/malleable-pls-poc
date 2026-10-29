import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom, PanelContainerPom } from './pom'

test.describe('Panel management', () => {
  test('panels are visible for the board the app opens on', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // The app opens on the first board in tab order: Evening Review in the seed.
    await expect(topBar.workspaceTabs.first()).toHaveText('Evening Review')
    await topBar.expectActiveWorkspace('Evening Review')
    await grid.expectPanelCount(4)
    await grid.expectHasPanel('Transcript')
    await grid.expectHasPanel('Test Me')
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
