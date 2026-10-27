import { z } from 'zod'
import { defineLlmTask } from '../llm'
import { extractiveSummary } from '@pls/substrate'

export interface LectureSummaryInput {
  lectureTitle: string
  transcript: string
}

/** Lines kept from a summary reply. */
export const SUMMARY_LINES = 3

/** Live prompts carry at most this much transcript (roughly 30 minutes of speech). */
const MAX_TRANSCRIPT_CHARS = 24_000

/** A 3-line summary shown at the top of the Transcript widget. */
export const lectureSummaryTask = defineLlmTask({
  name: 'lecture-summary',
  system: [
    'Summarise a university lecture for the student who attended it.',
    `Reply with exactly ${SUMMARY_LINES} short lines, each one plain sentence of at most 20 words:`,
    'what the lecture covered, the key idea, and what to be able to explain.',
    'Use the lecturer\'s terms. No bullet characters, no numbering.',
  ].join(' '),
  buildPrompt: (input: LectureSummaryInput) =>
    `Lecture: ${input.lectureTitle}\n\nTranscript:\n${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`,
  schema: z.object({ lines: z.array(z.string()) }),
  fake: (input) => ({ lines: extractiveSummary(input.transcript, SUMMARY_LINES) }),
  maxTokens: 300,
})

/** The stored summary: up to SUMMARY_LINES non-empty lines, bullets stripped. */
export function summaryBody(lines: string[]): string {
  return lines
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, SUMMARY_LINES)
    .join('\n')
}
