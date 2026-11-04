import { test as base, expect } from '@playwright/test'
import { consoleErrorsFixture, type ConsoleErrors } from '../playwright/console-guard'

/** Every e2e journey imports `test` from here, so each gets the console guard. */
export const test = base.extend<{
  /** Fails the test on any console.error or uncaught error (see playwright/console-guard.ts). */
  consoleErrors: ConsoleErrors
}>({
  consoleErrors: [consoleErrorsFixture, { auto: true }],
})

export { expect }
