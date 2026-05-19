import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'

export class SwitchPom {
  readonly root: Locator

  constructor(locator: Locator) {
    this.root = locator
  }

  async toggle() {
    await this.root.click()
  }

  async expectChecked() {
    await expect(this.root).toHaveAttribute('aria-checked', 'true')
  }

  async expectUnchecked() {
    await expect(this.root).toHaveAttribute('aria-checked', 'false')
  }

  async expectDisabled() {
    await expect(this.root).toBeDisabled()
  }
}
