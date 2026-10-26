import { createLlmClient, type LlmClient, type LlmRequest } from './llm'
import { fakeLlmFixtures } from './fake-llm-fixtures'

/**
 * Produces the fake reply for one task. Return a string for text tasks, or a
 * JSON-serialisable value for schema tasks (it is validated against the
 * request's schema, like a live reply). Must be deterministic: same request,
 * same reply.
 */
export type FakeLlmFixture = (req: LlmRequest) => unknown

export type FakeLlmFixtures = Record<string, FakeLlmFixture>

export interface FakeLlmClient extends LlmClient {
  /** Every request received, in order - handy for asserting prompts in tests. */
  calls: LlmRequest[]
}

/**
 * Deterministic stand-in for the live LLM, used in every test and in any run
 * without `AI_MODE=live`. Defaults to the shared fixtures in
 * ./fake-llm-fixtures.ts; tests can pass their own map (spread the defaults to
 * extend them).
 */
export function createFakeLlmClient(fixtures: FakeLlmFixtures = fakeLlmFixtures): FakeLlmClient {
  const calls: LlmRequest[] = []
  const client = createLlmClient('fake', async (req) => {
    calls.push(req)
    const fixture = Object.hasOwn(fixtures, req.task) ? fixtures[req.task] : undefined
    if (!fixture) {
      throw new Error(
        `No fake LLM fixture for task "${req.task}" - register one in apps/server/src/ai/fake-llm-fixtures.ts`,
      )
    }
    const reply = fixture(req)
    return typeof reply === 'string' ? reply : JSON.stringify(reply)
  })
  return { ...client, calls }
}
