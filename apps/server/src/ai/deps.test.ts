import { describe, it, expect } from 'vitest'
import { createAiDeps } from './deps'

describe('createAiDeps', () => {
  // The cost guardrail: the real test env (forced by vitest.setup.ts) must
  // only ever produce fakes.
  it('selects fakes under the test environment', () => {
    expect(process.env.AI_MODE).toBe('mock')
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined()

    const ai = createAiDeps()
    expect(ai.mode).toBe('mock')
    expect(ai.transcriber.name).toBe('mock')
    expect(ai.llm.name).toBe('fake')
  })

  it('defaults to mock when AI_MODE is unset, even with a key', () => {
    expect(createAiDeps({ OPENROUTER_API_KEY: 'test-key' }).mode).toBe('mock')
  })

  it.each([
    ['mock', 'test-key'],
    ['LIVE', 'test-key'],
    ['true', 'test-key'],
    ['live', undefined],
    ['live', ''],
    ['live', '   '],
  ])('stays mock for AI_MODE=%j with key %j', (mode, key) => {
    const ai = createAiDeps({ AI_MODE: mode, OPENROUTER_API_KEY: key })
    expect(ai.mode).toBe('mock')
    expect(ai.transcriber.name).toBe('mock')
    expect(ai.llm.name).toBe('fake')
  })

  it('builds the OpenRouter clients only for AI_MODE=live with a key (no request is made)', () => {
    const ai = createAiDeps({ AI_MODE: 'live', OPENROUTER_API_KEY: 'test-key', OPENROUTER_LLM_MODEL: 'some/model' })
    expect(ai.mode).toBe('live')
    expect(ai.transcriber.name).toBe('openrouter-whisper')
    expect(ai.llm.name).toBe('openrouter:some/model')
  })
})
