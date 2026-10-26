import path from 'path'
import { withUser } from '@pls/db'
import { createExecutorRegistry, type ExecutorRegistry } from '@pls/workflows'
import type { AiDeps } from '../ai/deps'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')

// Recording status once its transcript is written. Matches the seeded,
// already-transcribed recordings (see chk_recordings_status for the allowed set).
const TRANSCRIBED_STATUS = 'ready'

/**
 * Builds the executor registry for the server runtime. Executor bodies remain
 * server-specific (AI providers / direct postgres writes); only the registry
 * and the `(input, ctx) => Promise<JobResult>` signature are adopted from
 * `@pls/workflows`. AI capabilities arrive through `ai` (never constructed
 * here), so tests and mock runs cannot reach a real provider. The owning user
 * is carried in `input._userId` (injected at dispatch time) so executors can
 * open their own RLS-scoped tx via `withUser`.
 */
export function createServerExecutors(ai: AiDeps): ExecutorRegistry {
  const { transcriber } = ai
  const serverExecutors = createExecutorRegistry()

  serverExecutors.register(
    'ai:transcribe',
    async (input) => {
      const recordingId = (input.recording_id ?? input.target_id) as string
      const userId = input._userId as string | undefined
      if (!userId) {
        throw new Error('ai:transcribe requires input._userId - refusing to report success without writing segments')
      }

      const [recording] = await withUser(userId, (tx) => tx`
        SELECT audio_url FROM recordings WHERE id = ${recordingId}
      `)
      if (!recording) throw new Error(`Recording ${recordingId} not found`)

      const audioUrl = (recording.audio_url as string | null) ?? ''
      const segments = await transcriber.transcribe(path.join(UPLOADS_DIR, path.basename(audioUrl)))

      await withUser(userId, async (tx) => {
        for (const seg of segments) {
          await tx`
            INSERT INTO transcript_segments (user_id, recording_id, start_ms, end_ms, text, speaker)
            VALUES (${userId}, ${recordingId}, ${seg.startMs}, ${seg.endMs}, ${seg.text}, ${seg.speaker})
          `
        }
        await tx`UPDATE recordings SET status = ${TRANSCRIBED_STATUS} WHERE id = ${recordingId}`
      })

      return {
        output: { recording_id: recordingId, segment_count: segments.length, status: 'transcribed' },
        events: [],
      }
    },
    // Never auto-retry: a provider call that timed out may still be billed.
    // A failed run can be retried by hand.
    { label: 'Transcribe', category: 'ai', maxRetries: 0 },
  )

  serverExecutors.register(
    'search:related-docs',
    async (input) => {
      await delay(800 + Math.random() * 500)
      return {
        output: { target_id: input.target_id, results_count: 3 },
      }
    },
    { label: 'Find Related Docs', category: 'search' },
  )

  serverExecutors.register(
    'schedule:quiz',
    async (input) => {
      await delay(500)
      return {
        output: { target_id: input.target_id, scheduled: true },
      }
    },
    { label: 'Schedule Quiz', category: 'schedule' },
  )

  serverExecutors.register(
    'ai:generate-questions',
    async (input) => {
      await delay(1200 + Math.random() * 800)
      return {
        output: { target_id: input.target_id, questions_generated: 5 },
      }
    },
    { label: 'Generate Questions', category: 'ai' },
  )

  serverExecutors.register(
    'ai:find-connections',
    async (input) => {
      await delay(1000 + Math.random() * 1000)
      return {
        output: { target_id: input.target_id, connections_found: 2 },
      }
    },
    { label: 'Find Connections', category: 'ai' },
  )

  return serverExecutors
}
