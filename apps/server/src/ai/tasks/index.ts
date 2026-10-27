import type { LlmTask } from '../llm'
import type { TranscribedSegment } from '../transcriber'
import { lectureSummaryTask } from './lecture-summary'
import { planAutofillTask } from './plan-autofill'
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
  // Help me plan over an over-capacity demo week: about 9 hours of study time left, 12 needed.
  llmTaskSample(planAutofillTask, (lecture) => {
    const day = (d: number, h: number) => new Date(Date.UTC(2026, 10, 2 + d, h)).toISOString()
    const end = Date.UTC(2026, 10, 9)
    const task = (id: string, title: string, course: string, durationMin: number, dueAt: string | null, weakTopic = false) =>
      ({ id, title, course, dueAt, durationMin, assumed: false, weakTopic, latest: dueAt ? Date.parse(dueAt) : end })
    return {
      tasks: [
        task('lab-report', 'Lab report write-up', 'chemistry', 240, day(4, 17)),
        task('quiz-prep', 'Biology quiz prep', 'biology', 120, day(3, 9)),
        task('reading', 'Chemistry reading: chapter 6', 'chemistry', 180, null),
        task('review', `Review: ${lecture.title}`, 'biology', 30, day(2, 22), true),
        task('problems', 'Problem sheet 3', 'chemistry', 150, day(5, 12)),
      ],
      freeMin: 9 * 60,
      neededMin: 12 * 60,
      minutesPerDay: 120,
      weakTopics: lecture.segments.filter((s) => /maternal inheritance/i.test(s.text)).map((s) => s.text).slice(0, 2),
      timeZone: 'Europe/London',
    }
  }),
]
