import type { IncomingMessage, ServerResponse } from 'http'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { sql, withUser } from '@pls/db'
import { dispatchWorkflows } from './workflows/dispatch'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')

async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true })
}

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export async function handleUpload(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const userId = (req.headers['x-user-id'] as string) ?? 'anonymous'
    const title = (req.headers['x-recording-title'] as string) ?? 'Untitled Recording'
    const durationMs = Number(req.headers['x-recording-duration'] ?? '0')

    const body = await collectBody(req)
    if (body.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Empty body' }))
      return
    }

    await ensureUploadsDir()

    const recordingId = crypto.randomUUID()
    const filename = `${recordingId}.webm`
    const filePath = path.join(UPLOADS_DIR, filename)
    await writeFile(filePath, body)

    const audioUrl = `/uploads/${filename}`

    await withUser(userId, async (tx) => {
      await tx`
        INSERT INTO recordings (id, user_id, title, duration, audio_url, status)
        VALUES (${recordingId}, ${userId}, ${title}, ${durationMs}, ${audioUrl}, 'uploaded')
      `
      await dispatchWorkflows(tx, userId, 'recording:completed', {
        recording_id: recordingId,
      }, null)
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: recordingId, audioUrl }))
  } catch (err) {
    console.error('upload error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Upload failed' }))
  }
}
