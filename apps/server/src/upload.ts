import type { IncomingMessage, ServerResponse } from 'http'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { sql, withUser } from '@pls/db'
import { dispatchWorkflows } from './workflows/dispatch'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
])

function isAllowedContentType(contentType: string | undefined): boolean {
  if (!contentType) return false
  // Strip parameters like charset, codecs etc.
  const mimeType = contentType.split(';')[0].trim().toLowerCase()
  return ALLOWED_AUDIO_TYPES.has(mimeType)
}

function isAudioMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false

  // WebM: starts with 0x1A 0x45 0xDF 0xA3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return true
  }

  // OGG: starts with "OggS"
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return true
  }

  // WAV: starts with "RIFF"
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return true
  }

  // MP3: starts with 0xFF 0xFB, 0xFF 0xF3, or 0xFF 0xF2
  if (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xf3 || buffer[1] === 0xf2)) {
    return true
  }

  // MP3 with ID3 tag: starts with "ID3"
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return true
  }

  // MP4/M4A: has "ftyp" at offset 4
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return true
  }

  return false
}

async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true })
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_UPLOAD_BYTES) {
        req.destroy()
        reject(new Error('Upload exceeds maximum size'))
        return
      }
      chunks.push(chunk)
    })
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

    // Validate Content-Type header against audio allowlist
    if (!isAllowedContentType(req.headers['content-type'])) {
      res.writeHead(415, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unsupported media type. Accepted: audio/webm, audio/ogg, audio/mp4, audio/mpeg, audio/wav' }))
      return
    }

    let body: Buffer
    try {
      body = await collectBody(req)
    } catch {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Upload exceeds maximum size (${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` }))
      return
    }
    if (body.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Empty body' }))
      return
    }

    // Validate file magic bytes to verify actual audio content
    if (!isAudioMagicBytes(body)) {
      res.writeHead(415, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'File content does not match any known audio format' }))
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
