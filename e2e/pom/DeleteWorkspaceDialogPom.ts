import type { Locator, Page } from '@playwright/test'
import { DialogPom } from './DialogPom'

export class DeleteWorkspaceDialogPom extends DialogPom {
  readonly deleteButton: Locator
  readonly cancelButton: Locator

  constructor(page: Page) {
    // An alert dialog (role alertdialog), not a plain dialog: it asks before deleting.
    super(page, page.getByRole('alertdialog'))
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
