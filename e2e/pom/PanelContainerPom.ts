import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Wraps a single panel's PanelChrome. The header doubles as the drag
 * handle; the close button is labelled "Close <title>" and the lens
 * automations button "Automations for <label>".
 */
export class PanelContainerPom {
  readonly header: Locator
  readonly label: Locator
  readonly removeButton: Locator
  readonly workflowButton: Locator
  readonly dragHandle: Locator

  constructor(readonly root: Locator) {
    this.header = root.getByTestId('panel-header')
    this.label = root.getByTestId('panel-title')
    this.removeButton = root.getByRole('button', { name: /^Close / })
    this.workflowButton = root.getByRole('button', { name: /^Automations for / })
    this.dragHandle = this.header
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
