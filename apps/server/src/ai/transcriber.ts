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

/** Canned lecture segments so the upload -> transcript flow works without a provider. */
export const mockTranscriber: Transcriber = {
  name: 'mock',
  async transcribe() {
    await delay(MOCK_TRANSCRIBE_DELAY_MS)
    return [
      { startMs: 0, endMs: 60000, text: 'Welcome to today\'s lecture. We\'ll be covering the fundamentals of distributed systems.', speaker: 'Lecturer' },
      { startMs: 60000, endMs: 120000, text: 'The key challenge is maintaining consistency across multiple nodes while preserving availability.', speaker: 'Lecturer' },
      { startMs: 120000, endMs: 180000, text: 'Let\'s look at the CAP theorem and what it means in practice for system design.', speaker: 'Lecturer' },
    ]
  },
}
