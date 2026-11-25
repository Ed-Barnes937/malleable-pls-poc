import type { Locator } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * A 24-hour time field (shared-ui `TimeInput`, on UI SDK): a group named by
 * its label, with an hour and a minute spinbutton. Typed like a student
 * would: focus the hour, type the digits.
 */
export class TimeInputPom {
  readonly root: Locator
  readonly hour: Locator
  readonly minute: Locator

  /** `locator` is the group, e.g. `popover.getByLabel('Start time')`. */
  constructor(locator: Locator) {
    this.root = locator
    this.hour = locator.getByRole('spinbutton', { name: 'hour' })
    this.minute = locator.getByRole('spinbutton', { name: 'minute' })
  }

  /** Types `time` ("14:30") over what is there. */
  async fill(time: string) {
    await this.hour.focus()
    await this.hour.page().keyboard.type(time.replace(':', ''))
  }

  async expectValue(time: string) {
    const [hh, mm] = time.split(':').map(Number)
    await expect(this.hour).toHaveAttribute('aria-valuenow', String(hh))
    await expect(this.minute).toHaveAttribute('aria-valuenow', String(mm))
  }

  /** Focus is on its hour (where focus lands in it), or on `segment`. */
  async expectFocused(segment: 'hour' | 'minute' = 'hour') {
    await expect(this[segment]).toBeFocused()
  }
}
