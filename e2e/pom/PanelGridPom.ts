import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Wraps the freeform canvas (CanvasEngine). Panels are absolutely-positioned
 * divs tagged `data-panel-id`; each renders a PanelChrome header whose
 * `panel-title` span holds the manifest label.
 */
export class PanelGridPom {
  readonly root: Locator
  readonly panels: Locator
  readonly emptyState: Locator

  constructor(private page: Page) {
    this.root = page.getByTestId('canvas-container')
    this.panels = this.root.locator('[data-panel-id]')
    this.emptyState = page.getByTestId('workspace-empty-state')
  }

  async expectPanelCount(count: number) {
    await expect(this.panels).toHaveCount(count)
  }

  panelByLabel(label: string) {
    return this.panels.filter({
      has: this.page.locator('[data-testid="panel-title"]', { hasText: label }),
    })
  }

  async expectEmpty() {
    await expect(this.emptyState).toBeVisible()
  }

  async expectHasPanel(label: string) {
    await expect(this.panelByLabel(label)).toBeVisible()
  }
}
