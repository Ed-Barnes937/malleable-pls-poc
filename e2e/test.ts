import { test as base, expect } from '@playwright/test'
import { consoleErrorsFixture, type ConsoleErrors } from '../playwright/console-guard'
import { watchApiRequests } from './api-requests'

/** Every e2e journey imports `test` from here, so each gets the console guard. */
export const test = base.extend<{
  /** Fails the test on any console.error or uncaught error (see playwright/console-guard.ts). */
  consoleErrors: ConsoleErrors
}>({
  // When the test is over (after the console guard's check), the server
  // finishes every request the pages sent, and gets no new ones, before the
  // next test can reseed: a reseed alongside a save still in flight can
  // deadlock with it. reseed() itself waits for the jobs those requests
  // queued, and for any database work still going (such as a request a
  // navigation cancelled here, which the server may still be running).
  context: async ({ context }, use) => {
    const requests = watchApiRequests(context)
    await use(context)
    await requests.settle()
  },
  consoleErrors: [consoleErrorsFixture, { auto: true }],
})

export { expect }
