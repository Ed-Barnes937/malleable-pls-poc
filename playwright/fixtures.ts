import { test as base, expect } from '@playwright/experimental-ct-react'
import { BackendSimulator } from './backend-simulator'
import { consoleErrorsFixture, type ConsoleErrors } from './console-guard'

type Fixtures = {
  simulator: BackendSimulator
  /** Fails the test on any console.error or uncaught error (see ./console-guard.ts). */
  consoleErrors: ConsoleErrors
}

/** Every component test imports `test` from here, so each gets the console guard. */
export const test = base.extend<Fixtures>({
  simulator: async ({ page }, use) => {
    const simulator = new BackendSimulator()
    await simulator.handleNetworking(page)
    await use(simulator)
  },
  consoleErrors: [consoleErrorsFixture, { auto: true }],
})

export { expect }
