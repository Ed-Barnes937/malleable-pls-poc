import { describe, it, expect } from 'vitest'
import { getAvailableJobTypes } from '@pls/substrate'
import { createAiDeps } from '../ai/deps'
import { createServerExecutors } from './executors'

describe('createServerExecutors', () => {
  const executors = createServerExecutors(createAiDeps())

  it('runs every job the automation builder offers (the UI catalogue stays in sync)', () => {
    for (const job of getAvailableJobTypes()) {
      expect(executors.has(job.type), job.type).toBe(true)
    }
  })

  it('has no stub jobs that report success without doing anything', () => {
    for (const stub of ['search:related-docs', 'schedule:quiz', 'ai:generate-questions', 'ai:find-connections']) {
      expect(executors.has(stub), stub).toBe(false)
    }
  })

  it('never auto-retries jobs that call a paid AI provider', () => {
    for (const type of ['ai:transcribe', 'ai:summarize-lecture', 'plan:review-task']) {
      expect(executors.getMeta(type)?.maxRetries, type).toBe(0)
    }
  })
})
