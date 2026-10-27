// @vitest-environment node
import { readdir } from 'fs/promises'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { demoLectureSegments, loadDemoLecture } from '../demo-lecture'
import { createFakeLlmClient } from '../fake-llm'
import type { LlmTask } from '../llm'
import { llmTaskSamples } from './index'

function isLlmTask(value: unknown): value is LlmTask<unknown, unknown> {
  const v = value as Partial<LlmTask<unknown, unknown>> | null
  return typeof v === 'object' && v !== null && typeof v.name === 'string' && typeof v.buildPrompt === 'function'
    && typeof v.fake === 'function' && typeof v.jsonSchema === 'object'
}

/** Every LlmTask exported by a module in this folder. */
async function definedTasks(): Promise<string[]> {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts')
  const names: string[] = []
  for (const file of files) {
    const mod = (await import(`./${file}`)) as Record<string, unknown>
    for (const value of Object.values(mod)) if (isLlmTask(value)) names.push(value.name)
  }
  return names.sort()
}

describe('llmTaskSamples', () => {
  it('lists every LLM task defined in ai/tasks, once (so the live smoke test covers them all)', async () => {
    const registered = llmTaskSamples.map((s) => s.task.name).sort()
    expect(registered).toEqual(await definedTasks())
    expect(new Set(registered).size).toBe(registered.length)
  })

  it('builds sample inputs each task accepts (checked through the fake client)', async () => {
    const lecture = { title: 'Mitochondrial DNA', segments: demoLectureSegments(await loadDemoLecture()) }
    const llm = createFakeLlmClient()
    for (const { task, sampleInput } of llmTaskSamples) {
      await expect(llm.run(task, sampleInput(lecture))).resolves.toBeDefined()
    }
  })
})
