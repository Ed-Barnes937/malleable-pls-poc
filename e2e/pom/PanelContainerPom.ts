import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class PanelContainerPom {
  readonly header: Locator
  readonly label: Locator
  readonly removeButton: Locator
  readonly workflowButton: Locator
  readonly dragHandle: Locator

  constructor(readonly root: Locator) {
    this.header = root.locator('[class*="panel-drag-handle"]').first()
    this.label = root.locator('h3, [class*="font-medium"]').first()
    this.removeButton = root.getByTitle('Remove panel')
    this.workflowButton = root.getByTitle('Workflow settings')
    this.dragHandle = root.locator('.panel-drag-handle')
  }

  async remove() {
    await this.removeButton.click()
  }

  async openWorkflowSettings() {
    await this.workflowButton.click()
  }

  async expectLabel(text: string) {
    await expect(this.label).toContainText(text)
  }
}
