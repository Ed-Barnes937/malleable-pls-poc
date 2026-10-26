import { readFile } from 'fs/promises'
import { AssemblyAI } from 'assemblyai'

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
 * `createTranscriber`.
 */
export interface Transcriber {
  name: string
  transcribe(audioFilePath: string): Promise<TranscribedSegment[]>
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Canned lecture segments so the upload -> transcript flow works without a provider key. */
export const mockTranscriber: Transcriber = {
  name: 'mock',
  async transcribe() {
    await delay(1500 + Math.random() * 1000)
    return [
      { startMs: 0, endMs: 60000, text: 'Welcome to today\'s lecture. We\'ll be covering the fundamentals of distributed systems.', speaker: 'Lecturer' },
      { startMs: 60000, endMs: 120000, text: 'The key challenge is maintaining consistency across multiple nodes while preserving availability.', speaker: 'Lecturer' },
      { startMs: 120000, endMs: 180000, text: 'Let\'s look at the CAP theorem and what it means in practice for system design.', speaker: 'Lecturer' },
    ]
  },
}

export function createAssemblyAiTranscriber(apiKey: string): Transcriber {
  const client = new AssemblyAI({ apiKey })
  return {
    name: 'assemblyai',
    async transcribe(audioFilePath) {
      const uploadUrl = await client.files.upload(await readFile(audioFilePath))
      const transcript = await client.transcripts.transcribe({
        audio_url: uploadUrl,
        speaker_labels: true,
      })

      if (transcript.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${transcript.error}`)
      }

      const segments = (transcript.utterances ?? []).map((u) => ({
        startMs: u.start,
        endMs: u.end,
        text: u.text,
        speaker: u.speaker ?? 'Speaker',
      }))
      if (segments.length === 0 && transcript.text) {
        segments.push({
          startMs: 0,
          endMs: transcript.audio_duration ? transcript.audio_duration * 1000 : 0,
          text: transcript.text,
          speaker: 'Speaker',
        })
      }
      return segments
    },
  }
}

/** Picks the configured provider, falling back to the mock when no key is set. */
export function createTranscriber(env: NodeJS.ProcessEnv = process.env): Transcriber {
  if (env.ASSEMBLYAI_API_KEY) return createAssemblyAiTranscriber(env.ASSEMBLYAI_API_KEY)
  return mockTranscriber
}
