import type { Locator, Page } from '@playwright/test'

export class DialogPom {
  readonly root: Locator
  readonly title: Locator
  readonly closeButton: Locator
  readonly backdrop: Locator

  /** `root` is the dialog element: a plain dialog unless a subclass says otherwise. */
  constructor(page: Page, root: Locator = page.getByRole('dialog')) {
    this.root = root
    this.title = this.root.locator('h2')
    this.closeButton = this.root.getByLabel('Close')
    this.backdrop = page.locator('[data-testid="dialog-backdrop"]')
  }

  async close() {
    await this.closeButton.click()
  }

  async dismissViaBackdrop() {
    await this.backdrop.click()
  }
}
