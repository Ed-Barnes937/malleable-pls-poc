import type { Locator, Page } from '@playwright/test'

export class DialogPom {
  readonly root: Locator
  readonly title: Locator
  readonly closeButton: Locator
  readonly backdrop: Locator

  constructor(pageOrLocator: Page | Locator, titleText?: string) {
    if ('getByRole' in pageOrLocator && 'goto' in pageOrLocator) {
      this.root = pageOrLocator.getByRole('dialog')
    } else {
      this.root = (pageOrLocator as Locator).getByRole('dialog')
    }
    this.title = this.root.locator('h2')
    this.closeButton = this.root.getByLabel('Close')
    this.backdrop = (pageOrLocator as Page).locator('[data-testid="dialog-backdrop"]')
  }

  async close() {
    await this.closeButton.click()
  }

  async dismissViaBackdrop() {
    await this.backdrop.click()
  }
}
