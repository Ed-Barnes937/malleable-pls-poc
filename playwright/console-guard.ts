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
 *
 * Timing: the check runs when the test ends, after letting every open page
 * paint two more frames, so an error from the render the last action caused
 * (a render loop, a bad effect) is caught. An error that a timer raises later
 * than that (say 300ms after the last assertion) is not: waiting for those
 * would add the same wait to every test.
 */
export interface ConsoleErrors {
  /** Expect messages matching `pattern` in this test. */
  allow(pattern: RegExp): void
  /**
   * Expect the browser's "Failed to load resource" for requests the test
   * makes fail (a 4xx/5xx it fulfils, or an abort), by tRPC procedure
   * (`planItems.update`) or, for a plain endpoint, by path (`/upload`).
   *
   * A tRPC batch is one request, and the browser's line can't say which of
   * its calls failed, so a failed batch is only expected when every call in
   * it is one of the allowed procedures (exact names): a real failure batched
   * with the one the test fails is still reported. To fail one call inside a
   * batch in CT, use `simulator.failProcedure` instead, which logs nothing.
   */
  allowFailedRequest(...procedures: string[]): void
}

const FAILED_LOAD = /^Failed to load resource: /

/** The tRPC procedures (or, for anything else, the path) a request URL is for. */
function requestTargets(url: string): { path: string; procedures: string[] } {
  const { pathname } = new URL(url)
  const last = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1))
  return { path: pathname, procedures: last.split(',') }
}

function watchConsole(context: BrowserContext) {
  const errors: { text: string; url: string }[] = []
  const allowed: RegExp[] = []
  const allowedRequests = new Set<string>()
  context.on('console', (message) => {
    if (message.type() === 'error') errors.push({ text: message.text(), url: message.location().url })
  })
  context.on('weberror', (webError) => errors.push({ text: `Uncaught: ${webError.error().message}`, url: '' }))

  const expectedFailedLoad = ({ text, url }: { text: string; url: string }) => {
    if (!FAILED_LOAD.test(text) || !URL.canParse(url)) return false
    const { path, procedures } = requestTargets(url)
    return allowedRequests.has(path) || procedures.every((procedure) => allowedRequests.has(procedure))
  }

  return {
    allow(pattern: RegExp) {
      allowed.push(pattern)
    },
    allowFailedRequest(...procedures: string[]) {
      for (const procedure of procedures) allowedRequests.add(procedure)
    },
    unexpected(): string[] {
      return errors
        .filter((error) => !expectedFailedLoad(error) && !allowed.some((pattern) => pattern.test(error.text)))
        .map(({ text, url }) => (url ? `${text} (${url})` : text))
    },
  }
}

/** Two more frames on every open page, so the last action's render has run. */
async function settle(context: BrowserContext) {
  await Promise.all(context.pages().map((page) => Promise.race([
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))),
    // A page that is closing, stuck or on a faked clock (page.clock.install)
    // must not hold the test up.
    new Promise((resolve) => setTimeout(resolve, 250)),
  ]).catch(() => {})))
}

/** The `consoleErrors` fixture both suites install, with `{ auto: true }`. */
export async function consoleErrorsFixture(
  { context }: { context: BrowserContext },
  use: (guard: ConsoleErrors) => Promise<void>,
) {
  const guard = watchConsole(context)
  await use(guard)
  await settle(context)
  const unexpected = guard.unexpected()
  if (unexpected.length > 0) {
    throw new Error(`The page logged ${unexpected.length} unexpected error(s):\n${unexpected.join('\n')}`)
  }
}
