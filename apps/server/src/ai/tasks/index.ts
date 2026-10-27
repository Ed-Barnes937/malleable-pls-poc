import type { LlmTask } from '../llm'
import type { TranscribedSegment } from '../transcriber'
import { lectureSummaryTask } from './lecture-summary'
import { reviewTask } from './review-task'

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
export const llmTaskSamples: LlmTaskSample[] = [
  // As ai:summarize-lecture builds it: segment texts, one per line.
  llmTaskSample(lectureSummaryTask, (lecture) => ({
    lectureTitle: lecture.title,
    transcript: lecture.segments.map((s) => s.text).join('\n'),
  })),
  // The demo's confusing moment (maternal inheritance) with its neighbours.
  llmTaskSample(reviewTask, (lecture) => {
    const found = lecture.segments.findIndex((s) => /maternal inheritance/i.test(s.text))
    const i = found === -1 ? Math.floor(lecture.segments.length / 2) : found
    return {
      lectureTitle: lecture.title,
      moment: lecture.segments[i]?.text ?? '',
      before: lecture.segments[i - 1]?.text ?? '',
      after: lecture.segments[i + 1]?.text ?? '',
    }
  }),
]
