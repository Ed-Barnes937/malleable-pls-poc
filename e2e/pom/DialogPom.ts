import type { Locator, Page } from '@playwright/test'

export class DialogPom {
  readonly root: Locator
  readonly title: Locator
  readonly closeButton: Locator
  readonly backdrop: Locator

  constructor(page: Page) {
    this.root = page.getByRole('dialog')
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
