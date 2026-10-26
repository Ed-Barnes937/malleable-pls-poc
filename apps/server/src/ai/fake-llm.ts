import { createLlmClient, type LlmClient } from './llm'

export interface FakeLlmCall {
  task: string
  input: unknown
  prompt: string
}

export interface FakeLlmClient extends LlmClient {
  /** Every call received, in order - handy for asserting prompts in tests. */
  calls: FakeLlmCall[]
}

/**
 * Deterministic stand-in for the live LLM, used in every test and in any run
 * without `AI_MODE=live`. Replies with each task's own `fake(input)`, which
 * then goes through the same JSON parsing and schema validation as a live reply.
 */
export function createFakeLlmClient(): FakeLlmClient {
  const calls: FakeLlmCall[] = []
  const client = createLlmClient('fake', async ({ task, input, prompt }) => {
    calls.push({ task: task.name, input, prompt })
    return JSON.stringify(task.fake(input))
  })
  return { ...client, calls }
}
