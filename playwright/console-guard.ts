import type { Page } from '@playwright/test'

/**
 * Collects what the page logs as an error (console.error, uncaught
 * exceptions), so a test can fail on it: React reports render loops and
 * other misuse there and nowhere else. `allow` takes messages a test causes
 * on purpose (a request it makes fail). Used by the Resources tests, CT and
 * e2e; not (yet) by every suite.
 */
export function watchConsole(page: Page) {
  const errors: string[] = []
  const allowed: RegExp[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`)
  })
  page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`))
  return {
    allow(pattern: RegExp) {
      allowed.push(pattern)
    },
    /** The errors logged so far that no `allow` covers. */
    unexpected(): string[] {
      return errors.filter((text) => !allowed.some((pattern) => pattern.test(text)))
    },
  }
}
