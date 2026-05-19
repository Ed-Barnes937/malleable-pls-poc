import type { Locator, Page } from '@playwright/test'
import { DialogPom } from './DialogPom'

export class DeleteWorkspaceDialogPom extends DialogPom {
  readonly deleteButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    super(page, 'Delete Workspace')
    this.deleteButton = this.root.getByRole('button', { name: 'Delete' })
    this.cancelButton = this.root.getByRole('button', { name: 'Cancel' })
  }

  async confirm() {
    await this.deleteButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }
}
