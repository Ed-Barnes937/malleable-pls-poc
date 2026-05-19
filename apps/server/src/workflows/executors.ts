import { readFile } from 'fs/promises'
import path from 'path'
import { AssemblyAI } from 'assemblyai'
import { sql, withUser } from '@pls/db'
import { registerExecutor } from './job-runner'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

function getAssemblyClient(): AssemblyAI | null {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) return null
  return new AssemblyAI({ apiKey })
}

export function registerAllExecutors() {
  registerExecutor('ai:transcribe', async (input) => {
    const recordingId = (input.recording_id ?? input.target_id) as string
    const userId = input._userId as string | undefined

    const client = getAssemblyClient()
    if (!client) {
      console.log('ASSEMBLYAI_API_KEY not set — using mock transcription')
      await delay(1500 + Math.random() * 1000)

      if (userId) {
        await withUser(userId, async (tx) => {
          const segments = [
            { start: 0, end: 60000, text: 'Welcome to today\'s lecture. We\'ll be covering the fundamentals of distributed systems.' },
            { start: 60000, end: 120000, text: 'The key challenge is maintaining consistency across multiple nodes while preserving availability.' },
            { start: 120000, end: 180000, text: 'Let\'s look at the CAP theorem and what it means in practice for system design.' },
          ]
          for (const seg of segments) {
            await tx`
              INSERT INTO transcript_segments (user_id, recording_id, start_ms, end_ms, text, speaker)
              VALUES (${userId}, ${recordingId}, ${seg.start}, ${seg.end}, ${seg.text}, 'Lecturer')
            `
          }
          await tx`UPDATE recordings SET status = 'transcribed' WHERE id = ${recordingId}`
        })
      }

      return {
        output: { recording_id: recordingId, segment_count: 3, status: 'transcribed' },
        events: [],
      }
    }

    const [recording] = await sql`SELECT * FROM recordings WHERE id = ${recordingId}`
    if (!recording) throw new Error(`Recording ${recordingId} not found`)

    const audioUrl = recording.audio_url as string
    const filePath = path.join(UPLOADS_DIR, path.basename(audioUrl))
    const audioData = await readFile(filePath)
    const uploadUrl = await client.files.upload(audioData)

    const transcript = await client.transcripts.transcribe({
      audio_url: uploadUrl,
      speaker_labels: true,
    })

    if (transcript.status === 'error') {
      throw new Error(`AssemblyAI transcription failed: ${transcript.error}`)
    }

    const ownerUserId = userId ?? (recording.user_id as string)
    const utterances = transcript.utterances ?? []
    let segmentCount = 0

    await withUser(ownerUserId, async (tx) => {
      for (const utterance of utterances) {
        await tx`
          INSERT INTO transcript_segments (user_id, recording_id, start_ms, end_ms, text, speaker)
          VALUES (${ownerUserId}, ${recordingId}, ${utterance.start}, ${utterance.end}, ${utterance.text}, ${utterance.speaker ?? 'Speaker'})
        `
        segmentCount++
      }

      if (segmentCount === 0 && transcript.text) {
        await tx`
          INSERT INTO transcript_segments (user_id, recording_id, start_ms, end_ms, text, speaker)
          VALUES (${ownerUserId}, ${recordingId}, 0, ${transcript.audio_duration ? transcript.audio_duration * 1000 : 0}, ${transcript.text}, 'Speaker')
        `
        segmentCount = 1
      }

      await tx`UPDATE recordings SET status = 'transcribed' WHERE id = ${recordingId}`
    })

    return {
      output: { recording_id: recordingId, segment_count: segmentCount, status: 'transcribed' },
      events: [],
    }
  })

  registerExecutor('search:related-docs', async (input) => {
    await delay(800 + Math.random() * 500)
    return {
      output: { target_id: input.target_id, results_count: 3 },
    }
  })

  registerExecutor('schedule:quiz', async (input) => {
    await delay(500)
    return {
      output: { target_id: input.target_id, scheduled: true },
    }
  })

  registerExecutor('ai:generate-questions', async (input) => {
    await delay(1200 + Math.random() * 800)
    return {
      output: { target_id: input.target_id, questions_generated: 5 },
    }
  })

  registerExecutor('ai:find-connections', async (input) => {
    await delay(1000 + Math.random() * 1000)
    return {
      output: { target_id: input.target_id, connections_found: 2 },
    }
  })
}
