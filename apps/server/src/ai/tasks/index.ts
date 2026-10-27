import type { LlmTask } from '../llm'
import type { TranscribedSegment } from '../transcriber'

/** What a sample input can be built from: a transcribed lecture. */
export interface SampleLecture {
  title: string
  segments: TranscribedSegment[]
}

export interface LlmTaskSample {
  task: LlmTask<unknown, unknown>
  /** A realistic input for one run of the task, built from a lecture. */
  sampleInput(lecture: SampleLecture): unknown
}

/** Pairs a task with its sample input, type-checking one against the other. */
export function llmTaskSample<I, O>(task: LlmTask<I, O>, sampleInput: (lecture: SampleLecture) => I): LlmTaskSample {
  return { task: task as unknown as LlmTask<unknown, unknown>, sampleInput }
}

/**
 * Every LLM task the server defines, each with a sample input. The live smoke
 * test (scripts/demo/live-smoke.mts) runs each one once against the real
 * provider; ./index.test.ts fails if any `defineLlmTask` in apps/server/src is
 * missing (or unexported), so add new tasks
 * with `llmTaskSample(task, (lecture) => input)`.
 */
export const llmTaskSamples: LlmTaskSample[] = []
