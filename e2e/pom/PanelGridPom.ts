import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class PanelGridPom {
  readonly root: Locator
  readonly panels: Locator
  readonly dropZone: Locator

  constructor(private page: Page) {
    this.root = page.locator('main')
    this.panels = this.root.locator('.react-grid-item')
    this.dropZone = this.root.getByText('Drop lens here')
  }

  async expectPanelCount(count: number) {
    await expect(this.panels).toHaveCount(count)
  }

  panelByLabel(label: string) {
    return this.root.locator('.react-grid-item').filter({ hasText: label })
  }

  async expectEmpty() {
    await expect(this.dropZone).toBeVisible()
  }

  async expectHasPanel(label: string) {
    await expect(this.panelByLabel(label)).toBeVisible()
  }
}
