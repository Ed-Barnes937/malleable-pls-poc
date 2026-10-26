import { createFakeLlmClient } from './fake-llm'
import type { LlmClient } from './llm'
import { createOpenRouterLlmClient, createOpenRouterWhisperTranscriber } from './openrouter'
import { mockTranscriber, type Transcriber } from './transcriber'

export type AiMode = 'live' | 'mock'

/**
 * Every AI capability the server uses. Created once in index.ts and passed to
 * executors (createServerExecutors) and routers (tRPC context), so tests and
 * mock runs can never reach a real provider.
 */
export interface AiDeps {
  mode: AiMode
  transcriber: Transcriber
  llm: LlmClient
}

/**
 * Live OpenRouter clients only when AI_MODE=live AND OPENROUTER_API_KEY is
 * set; anything else (including a missing or empty key) gets deterministic
 * fakes. Test entry points force AI_MODE=mock and unset the key on top of this.
 */
export function createAiDeps(env: NodeJS.ProcessEnv = process.env): AiDeps {
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (env.AI_MODE === 'live' && apiKey) {
    return {
      mode: 'live',
      transcriber: createOpenRouterWhisperTranscriber({ apiKey }),
      llm: createOpenRouterLlmClient({ apiKey, model: env.OPENROUTER_LLM_MODEL?.trim() || undefined }),
    }
  }
  return { mode: 'mock', transcriber: mockTranscriber, llm: createFakeLlmClient() }
}

/** One startup line so it is obvious whether a run can spend money. */
export function describeAiDeps(ai: AiDeps, env: NodeJS.ProcessEnv = process.env): string {
  if (ai.mode === 'live') return `AI_MODE=live - transcriber=${ai.transcriber.name}, llm=${ai.llm.name}`
  const reason = env.AI_MODE === 'live' ? ' (AI_MODE=live but OPENROUTER_API_KEY is not set)' : ''
  return `AI_MODE=mock${reason} - using fake transcriber and LLM`
}
