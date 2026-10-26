import type { FakeLlmFixtures } from './fake-llm'

/**
 * Fake replies for every LLM task, keyed by `LlmRequest.task`. Each feature
 * that adds an LLM call adds its fixture here (one entry per task, e.g.
 * `review-task`, `lecture-summary`, `plan-autofill`).
 *
 * Fixtures should be content-aware - derive the reply from `req.input` (the
 * transcript moment, the to-do titles...) so screenshots and demos in mock
 * mode look real - and deterministic, so tests can assert on them.
 */
export const fakeLlmFixtures: FakeLlmFixtures = {}
