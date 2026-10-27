import type { IncomingMessage, ServerResponse } from 'http'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { sql, withUser } from '@pls/db'
import { dispatchWorkflows } from './workflows/dispatch'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')

// Accepted audio MIME types (including common browser aliases) -> stored file
// extension. The extension lets /uploads serve the right Content-Type back.
const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}

export const AUDIO_CONTENT_TYPES: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

function audioExtension(contentType: string | undefined): string | null {
  if (!contentType) return null
  // Strip parameters like charset, codecs etc.
  const mimeType = contentType.split(';')[0].trim().toLowerCase()
  return AUDIO_EXTENSIONS[mimeType] ?? null
}

const MAX_TITLE_LENGTH = 200
const BOARD_ID_RE = /^[a-zA-Z0-9_-]{1,255}$/
const MAX_COURSE_LENGTH = 100

/**
 * Title / course headers are URI-encoded by the client because header values
 * must be ISO-8859-1 and filenames often aren't. Falls back to the raw value
 * for clients that send plain ASCII.
 */
function decodeHeader(value: string | string[] | undefined, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {}
  const trimmed = decoded.trim().slice(0, maxLength)
  return trimmed || null
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
    const title = decodeHeader(req.headers['x-recording-title'], MAX_TITLE_LENGTH) ?? 'Untitled Recording'
    const course = decodeHeader(req.headers['x-recording-course'], MAX_COURSE_LENGTH)
    // The board the upload came from, so that board's automations run.
    const rawBoard = req.headers['x-workspace-id']
    const workspaceId = typeof rawBoard === 'string' && BOARD_ID_RE.test(rawBoard) ? rawBoard : null
    const parsedDuration = Math.round(Number(req.headers['x-recording-duration'] ?? '0'))
    const durationMs = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0

    // Validate Content-Type header against audio allowlist
    const extension = audioExtension(req.headers['content-type'])
    if (!extension) {
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
    const filename = `${recordingId}.${extension}`
    const filePath = path.join(UPLOADS_DIR, filename)
    await writeFile(filePath, body)

    const audioUrl = `/uploads/${filename}`

    await withUser(userId, async (tx) => {
      await tx`
        INSERT INTO recordings (id, user_id, title, duration, audio_url, status)
        VALUES (${recordingId}, ${userId}, ${title}, ${durationMs}, ${audioUrl}, 'uploaded')
      `
      // Courses are modelled as a 'recording' tag (see recordings.list courseTag filter).
      if (course) {
        await tx`
          INSERT INTO tags (user_id, target_type, target_id, label)
          VALUES (${userId}, 'recording', ${recordingId}, ${course})
        `
      }
      await dispatchWorkflows(tx, userId, 'recording:completed', {
        recording_id: recordingId,
      }, workspaceId)
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: recordingId, audioUrl }))
  } catch (err) {
    console.error('upload error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Upload failed' }))
  }
}
