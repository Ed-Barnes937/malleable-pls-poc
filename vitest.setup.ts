import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, expect, vi } from 'vitest'

// Cost guardrail: no test may reach a real AI provider. Force the fakes even
// if the shell exported live settings (see apps/server/src/ai/deps.ts).
process.env.AI_MODE = 'mock'
delete process.env.OPENROUTER_API_KEY

// Integration tests make dozens of sequential round trips to a shared Postgres.
// Their cost is I/O latency, not CPU, so it balloons when the machine or the
// database is busy (several suites at once, CI). A test that times out keeps
// running and then pollutes the shared fixtures of the tests after it, which
// shows up as unrelated count mismatches. Give them room; unit tests keep the
// default 5s so a slow one is still noticed.
if (expect.getState().testPath?.endsWith('.db.test.ts')) {
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
}

// Any console.error fails the test, as in the Playwright suites
// (playwright/console-guard.ts): React reports render loops, act() misuse and
// bad props there and nowhere else. A test that causes one on purpose spies on
// console.error itself (vi.spyOn(console, 'error').mockImplementation(...))
// and asserts what it logged; that spy stands in for this guard.
//
// Limit: an error a test leaves behind (a timer, a late promise) fails
// whichever test is running when it lands, usually the next one. After a
// file's last test, afterAll waits one macrotask first, so a promise or a
// setTimeout(0) left by that test still fails the file; a longer timer is
// missed. The message says so; look at the test before it. Tracking the cause
// per test would need async context tracking. Probed by
// playwright/vitest-console-guard.test.ts.
const realConsoleError = console.error
let consoleErrors: string[] = []
console.error = (...args: unknown[]) => {
  consoleErrors.push(args.map(String).join(' '))
  realConsoleError(...args)
}
function failOnConsoleErrors(when: string) {
  if (consoleErrors.length === 0) return
  const logged = consoleErrors
  consoleErrors = []
  throw new Error(`console.error was called ${logged.length} time(s) ${when} (if this test logs nothing, an earlier test in the file left it behind):\n${logged.join('\n')}`)
}
afterEach(() => failOnConsoleErrors('during this test'))
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  failOnConsoleErrors('after the last test in this file')
})
