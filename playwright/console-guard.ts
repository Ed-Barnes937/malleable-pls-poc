import type { BrowserContext } from '@playwright/test'

/**
 * Fails a test on anything its pages log as an error (console.error,
 * uncaught exceptions): React reports render loops and other misuse there
 * and nowhere else, so a test can otherwise pass over a broken page.
 *
 * Every CT and e2e test gets it, without opting in, as the auto fixture
 * `consoleErrors` (`playwright/fixtures.ts`, `e2e/test.ts`). A test that
 * causes an error on purpose (a request it makes fail) declares exactly the
 * messages it expects, in that test:
 *
 *   test('a failed save says so', async ({ page, consoleErrors }) => {
 *     consoleErrors.allowFailedRequest('planItems.update')
 *
 * There is deliberately no switch to turn it off.
 */
export interface ConsoleErrors {
  /** Expect messages matching `pattern` in this test. */
  allow(pattern: RegExp): void
  /**
   * Expect the browser's "Failed to load resource" for a request to `path`
   * (a tRPC procedure such as `planItems.update`, or `/upload`) that the
   * test makes fail: a 4xx/5xx it fulfils, or an abort.
   */
  allowFailedRequest(path: string): void
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function watchConsole(context: BrowserContext) {
  const errors: string[] = []
  const allowed: RegExp[] = []
  context.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`)
  })
  context.on('weberror', (webError) => errors.push(`Uncaught: ${webError.error().message}`))
  return {
    allow(pattern: RegExp) {
      allowed.push(pattern)
    },
    allowFailedRequest(path: string) {
      allowed.push(new RegExp(`^Failed to load resource: .* \\(https?://[^ ]*${escapeRegExp(path)}[^ ]*\\)$`))
    },
    unexpected(): string[] {
      return errors.filter((text) => !allowed.some((pattern) => pattern.test(text)))
    },
  }
}

/** The `consoleErrors` fixture both suites install, with `{ auto: true }`. */
export async function consoleErrorsFixture(
  { context }: { context: BrowserContext },
  use: (guard: ConsoleErrors) => Promise<void>,
) {
  const guard = watchConsole(context)
  await use(guard)
  const unexpected = guard.unexpected()
  if (unexpected.length > 0) {
    throw new Error(`The page logged ${unexpected.length} unexpected error(s):\n${unexpected.join('\n')}`)
  }
}
