import { z } from 'zod'
import { defineLlmTask } from '../llm'
import { keyPhrase } from '@pls/substrate'

export interface ReviewTaskInput {
  lectureTitle: string
  /** The transcript moment the student marked. */
  moment: string
  /** The moments either side, for context ('' when there is none). */
  before: string
  after: string
}

/**
 * Names what a student found confusing, so the review to-do reads
 * "Review: maternal inheritance". The LLM only writes the words; duration and
 * timing come from the automation's params and the scheduler.
 */
export const reviewTask = defineLlmTask({
  name: 'review-task',
  system: [
    'A student marked a moment in a lecture as confusing.',
    'Name the idea they should review in 2 to 5 lowercase words, the way a classmate would say it',
    '(for example "maternal inheritance" or "the krebs cycle").',
    'Do not start with "review" and do not end with punctuation.',
  ].join(' '),
  buildPrompt: (input: ReviewTaskInput) => [
    `Lecture: ${input.lectureTitle}`,
    input.before && `Just before: ${input.before}`,
    `The confusing moment: ${input.moment}`,
    input.after && `Just after: ${input.after}`,
  ].filter(Boolean).join('\n'),
  schema: z.object({ topic: z.string() }),
  fake: (input) => ({ topic: keyPhrase(input.moment, { before: input.before, after: input.after }) }),
  maxTokens: 60,
})

const MAX_TOPIC_CHARS = 60

/** "Review: <topic>", tidied; falls back to the transcript heuristic if the reply is unusable. */
export function reviewTitle(topic: string, input: ReviewTaskInput): string {
  let cleaned = topic.trim().replace(/^["'\s]+|["'.!?\s]+$/g, '').replace(/^review:?\s*/i, '')
  if (!cleaned) cleaned = keyPhrase(input.moment, { before: input.before, after: input.after })
  if (cleaned.length > MAX_TOPIC_CHARS) cleaned = `${cleaned.slice(0, MAX_TOPIC_CHARS).replace(/\s+\S*$/, '')}...`
  return `Review: ${cleaned}`
}
