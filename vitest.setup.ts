import '@testing-library/jest-dom/vitest'
import { expect, vi } from 'vitest'

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
