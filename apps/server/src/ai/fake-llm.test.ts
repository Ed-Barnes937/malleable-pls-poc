import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createFakeLlmClient } from './fake-llm'
import { fakeLlmFixtures } from './fake-llm-fixtures'

const reviewSchema = z.object({ title: z.string() })

describe('createFakeLlmClient', () => {
  const llm = createFakeLlmClient({
    ...fakeLlmFixtures,
    'review-task': (req) => ({ title: `Review: ${String(req.input?.topic)}` }),
    'lecture-summary': () => 'Line one.\nLine two.\nLine three.',
    'bad-shape': () => ({ heading: 'no title field' }),
  })

  it('returns a validated, content-aware JSON fixture for schema tasks', async () => {
    const reply = await llm.complete({
      task: 'review-task',
      system: 's',
      prompt: 'p',
      input: { topic: 'maternal inheritance' },
      schema: reviewSchema,
    })
    expect(reply).toEqual({ title: 'Review: maternal inheritance' })
  })

  it('returns text for tasks without a schema', async () => {
    const reply = await llm.complete({ task: 'lecture-summary', system: 's', prompt: 'p' })
    expect(reply).toBe('Line one.\nLine two.\nLine three.')
  })

  it('records every call', async () => {
    const fresh = createFakeLlmClient({ t: () => 'ok' })
    await fresh.complete({ task: 't', system: 'sys', prompt: 'hello' })
    expect(fresh.calls).toEqual([{ task: 't', system: 'sys', prompt: 'hello' }])
  })

  it('fails loudly when a task has no fixture', async () => {
    await expect(llm.complete({ task: 'unknown', system: 's', prompt: 'p' }))
      .rejects.toThrow('No fake LLM fixture for task "unknown"')
    await expect(llm.complete({ task: 'toString', system: 's', prompt: 'p' }))
      .rejects.toThrow('No fake LLM fixture')
  })

  it('validates fixtures against the schema like a live reply', async () => {
    await expect(llm.complete({ task: 'bad-shape', system: 's', prompt: 'p', schema: reviewSchema }))
      .rejects.toThrow('did not match its schema')
  })
})
