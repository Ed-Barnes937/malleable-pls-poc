import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createFakeLlmClient } from './fake-llm'
import { defineLlmTask } from './llm'

const reviewTask = defineLlmTask({
  name: 'review-task',
  system: 'Write a short review task title.',
  buildPrompt: (input: { topic: string }) => `Topic: ${input.topic}`,
  schema: z.object({ title: z.string() }),
  fake: (input) => ({ title: `Review: ${input.topic}` }),
})

describe('createFakeLlmClient', () => {
  it('replies with the task fake, derived from the input', async () => {
    const llm = createFakeLlmClient()
    const reply = await llm.run(reviewTask, { topic: 'maternal inheritance' })
    expect(reply).toEqual({ title: 'Review: maternal inheritance' })
  })

  it('records every call with its built prompt', async () => {
    const llm = createFakeLlmClient()
    await llm.run(reviewTask, { topic: 'CAP theorem' })
    expect(llm.calls).toEqual([{ task: 'review-task', input: { topic: 'CAP theorem' }, prompt: 'Topic: CAP theorem' }])
  })

  it('validates the fake against the schema like a live reply', async () => {
    const drifted = defineLlmTask({
      name: 'drifted',
      system: 's',
      buildPrompt: () => 'p',
      schema: z.object({ minutes: z.number() }),
      // A fake that type-checks but violates a runtime refinement still fails.
      fake: () => ({ minutes: Number.NaN }),
    })
    await expect(createFakeLlmClient().run(drifted, undefined)).rejects.toThrow('did not match its schema')
  })
})
