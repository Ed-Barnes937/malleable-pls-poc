// Live smoke test of every AI call the demo makes, against the real
// OpenRouter APIs. COSTS MONEY: run by Ed only, never by an agent or in CI.
//
//   AI_MODE=live pnpm demo:live-smoke
//
// Transcribes the demo lecture wav with Whisper, then runs each LLM task in
// apps/server/src/ai/tasks (llmTaskSamples) once on that transcript, printing
// every result and the cost of each call plus the total.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createAiDeps, describeAiDeps } from '../../apps/server/src/ai/deps'
import { demoLectureAudioPath, demoLectureSegments, loadDemoLecture } from '../../apps/server/src/ai/demo-lecture'
import type { TranscribedSegment } from '../../apps/server/src/ai/transcriber'
import { llmTaskSamples } from '../../apps/server/src/ai/tasks/index'

// Checked before any env file is loaded, so it has to be typed on the command line.
if (process.env.AI_MODE !== 'live') {
  console.error('live-smoke: refusing to run. This calls paid APIs; run it explicitly with AI_MODE=live pnpm demo:live-smoke')
  process.exit(1)
}

const envFile = fileURLToPath(new URL('../../apps/server/.env', import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)

// Tally `usage.cost` from every OpenRouter reply. The live clients pick up
// globalThis.fetch when createAiDeps builds them, so wrap it first.
const costs: { endpoint: string; cost: number | undefined }[] = []
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const res = await realFetch(input, init)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('https://openrouter.ai/')) {
    const body = (await res.clone().json().catch(() => null)) as { usage?: { cost?: number } } | null
    costs.push({ endpoint: new URL(url).pathname, cost: body?.usage?.cost })
  }
  return res
}

const ai = createAiDeps(process.env)
console.log(describeAiDeps(ai, process.env))
if (ai.mode !== 'live') {
  console.error('live-smoke: OPENROUTER_API_KEY is not set (in the environment or apps/server/.env); nothing was called')
  process.exit(1)
}

const failures: string[] = []
const formatCost = (cost: number | undefined) => (cost === undefined ? 'n/a' : `$${cost.toFixed(6)}`)
const lastCost = () => formatCost(costs.at(-1)?.cost)

console.log(`\n== Transcribe ${demoLectureAudioPath()}`)
const expected = await loadDemoLecture()
let segments: TranscribedSegment[]
try {
  segments = await ai.transcriber.transcribe(demoLectureAudioPath())
  console.log(`${segments.length} segments (the script has ${expected.segments.length} paragraphs), cost ${lastCost()}`)
  for (const s of segments) {
    console.log(`  [${(s.startMs / 1000).toFixed(1)}s-${(s.endMs / 1000).toFixed(1)}s] ${s.text}`)
  }
  if (segments.length === 0) failures.push('transcribe: no segments')
} catch (err) {
  failures.push(`transcribe: ${(err as Error).message}`)
  console.error(`FAILED: ${(err as Error).message}`)
  segments = []
}
if (segments.length === 0) {
  console.log('(the LLM tasks below use the script text instead)')
  segments = demoLectureSegments(expected)
}

const lecture = { title: 'Mitochondrial DNA', segments }
for (const { task, sampleInput } of llmTaskSamples) {
  console.log(`\n== LLM task ${task.name}`)
  try {
    const result = await ai.llm.run(task, sampleInput(lecture))
    console.log(JSON.stringify(result, null, 2))
    console.log(`cost ${lastCost()}`)
  } catch (err) {
    failures.push(`${task.name}: ${(err as Error).message}`)
    console.error(`FAILED: ${(err as Error).message}`)
  }
}
if (llmTaskSamples.length === 0) console.log('\n(no LLM tasks are registered in apps/server/src/ai/tasks/index.ts)')

const total = costs.reduce((sum, c) => sum + (c.cost ?? 0), 0)
console.log(`\n== ${costs.length} OpenRouter call(s), total cost ${formatCost(total)}${costs.some((c) => c.cost === undefined) ? ' (some calls reported no cost)' : ''}`)
if (failures.length > 0) {
  console.error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('All live AI calls succeeded.')
