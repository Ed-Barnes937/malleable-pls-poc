export interface TranscribedSegment {
  startMs: number
  endMs: number
  text: string
  speaker: string
}

/**
 * Turns an uploaded audio file into transcript segments. The `ai:transcribe`
 * executor owns loading the recording and persisting the result, so a new
 * provider only has to implement this one method and be picked in
 * `createAiDeps` (see ./deps.ts).
 */
export interface Transcriber {
  name: string
  transcribe(audioFilePath: string): Promise<TranscribedSegment[]>
}

// Long enough for the UI to show the "transcribing" state, short enough for e2e.
export const MOCK_TRANSCRIBE_DELAY_MS = 1500

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Canned lecture so the upload -> transcript -> summary flow works without a
 * provider. A short Biology lecture, so mock-mode summaries and review to-dos
 * read like the demo's subject.
 */
export const mockTranscriptSegments: readonly TranscribedSegment[] = [
  { startMs: 0, endMs: 45000, text: 'Welcome back. Today we\'re looking at mitochondrial DNA and why it behaves so differently from the DNA in the nucleus.', speaker: 'Lecturer' },
  { startMs: 45000, endMs: 95000, text: 'Mitochondria carry their own small circular genome, about sixteen and a half thousand base pairs, coding for thirty-seven genes.', speaker: 'Lecturer' },
  { startMs: 95000, endMs: 150000, text: 'Here\'s the part people find tricky. You inherit your mitochondria only from your mother. This is what we call maternal inheritance.', speaker: 'Lecturer' },
  { startMs: 150000, endMs: 205000, text: 'Sperm mitochondria are tagged and destroyed after fertilisation, so the father\'s mitochondrial DNA almost never reaches the embryo.', speaker: 'Lecturer' },
  { startMs: 205000, endMs: 260000, text: 'Because mitochondrial DNA skips recombination, it changes only by mutation, which makes it a useful clock for tracing ancestry.', speaker: 'Lecturer' },
  { startMs: 260000, endMs: 310000, text: 'For Thursday\'s quiz, be ready to explain why mitochondrial diseases pass from a mother to all of her children.', speaker: 'Lecturer' },
]

export const mockTranscriber: Transcriber = {
  name: 'mock',
  async transcribe() {
    await delay(MOCK_TRANSCRIBE_DELAY_MS)
    return mockTranscriptSegments.map((s) => ({ ...s }))
  },
}
