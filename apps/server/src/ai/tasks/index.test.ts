// @vitest-environment node
import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
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

const SERVER_SRC = fileURLToPath(new URL('../../', import.meta.url))
// llm.ts declares defineLlmTask itself.
const DEFINITION_FILE = path.join(SERVER_SRC, 'ai', 'llm.ts')

/**
 * Every LlmTask defined anywhere in apps/server/src: each non-test module that
 * calls `defineLlmTask(` must export one task per call, so none can hide from
 * the registry by living elsewhere or staying unexported.
 */
async function definedTasks(): Promise<string[]> {
  const files = (await readdir(SERVER_SRC, { recursive: true }))
    .map((f) => path.join(SERVER_SRC, f))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== DEFINITION_FILE)
  const names: string[] = []
  for (const file of files) {
    const calls = (await readFile(file, 'utf8')).match(/\bdefineLlmTask\(/g)?.length ?? 0
    if (calls === 0) continue
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
    const exported = Object.values(mod).filter(isLlmTask).map((t) => t.name)
    expect(exported, `${path.relative(SERVER_SRC, file)}: every defineLlmTask() result must be exported`).toHaveLength(calls)
    names.push(...exported)
  }
  return names.sort()
}

describe('llmTaskSamples', () => {
  it('lists every LLM task defined in apps/server/src, once (so the live smoke test covers them all)', async () => {
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
