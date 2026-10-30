import type { IncomingMessage, ServerResponse } from 'http'
import { writeFile, mkdir, rm } from 'fs/promises'
import { TRPCError } from '@trpc/server'
import path from 'path'
import { withUser, type TxSql } from '@pls/db'
import { dispatchWorkflows } from './workflows/dispatch'
import { isCourse, requireOwnLecture } from './routers/_shared'
import { ensureDefaultAutomations } from './workflows/defaults'
import { readBoardScope, writeBoardScope } from './routers/_board-scope'

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
// A client-made id per capture or file (a UUID from the web app).
const UPLOAD_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

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

async function ownsLecture(userId: string, lectureId: string): Promise<boolean> {
  const [row] = await withUser(userId, (tx) => tx`SELECT 1 FROM lectures WHERE id = ${lectureId} AND user_id = ${userId}`)
  return !!row
}

/**
 * Selects `lectureId`, a lecture this upload just made, on the board the
 * upload came from, when that board still shows no lecture (or one that is
 * gone): the board the student uploaded from, unless they have moved it on
 * to another lecture meanwhile. Returns whether it did. A board that isn't
 * the student's (or is gone) is left alone.
 */
async function selectNewLectureOnBoard(tx: TxSql, userId: string, workspaceId: string, lectureId: string): Promise<boolean> {
  const [board] = await tx`SELECT id FROM workspaces WHERE id = ${workspaceId} AND user_id = ${userId} FOR NO KEY UPDATE`
  if (!board) return false
  const current = await readBoardScope(tx, userId, workspaceId)
  if (current.lectureId) {
    const [stillThere] = await tx`SELECT 1 FROM lectures WHERE id = ${current.lectureId} AND user_id = ${userId}`
    if (stillThere) return false
  }
  await writeBoardScope(tx, userId, workspaceId, { lectureId })
  return true
}

/** What /upload answers with: the recording, its lecture, and whether that lecture was selected on the board. */
interface Saved {
  id: string
  lectureId: string
  selected: boolean
  audioUrl: string | null
}

/**
 * The recording a try of this upload (`x-upload-id`) already saved, if one
 * did: a retry after a lost response gets it back instead of a second copy.
 * `selected` says whether `selectOn` (the board, with `x-select-on-board`)
 * now shows its lecture, as a first try's answer would have.
 */
async function savedUpload(userId: string, uploadId: string, selectOn: string | null): Promise<Saved | null> {
  return withUser(userId, async (tx) => {
    const [row] = await tx`
      SELECT id, lecture_id, audio_url FROM recordings WHERE user_id = ${userId} AND upload_id = ${uploadId}
    `
    if (!row) return null
    const lectureId = row.lecture_id as string
    let selected = false
    if (selectOn) {
      const [board] = await tx`SELECT id FROM workspaces WHERE id = ${selectOn} AND user_id = ${userId}`
      selected = !!board && (await readBoardScope(tx, userId, selectOn)).lectureId === lectureId
    }
    return { id: row.id as string, lectureId, selected, audioUrl: (row.audio_url as string | null) ?? null }
  })
}

/** Thrown inside the insert's transaction when another try of the same upload got there first. */
class AlreadySaved extends Error {}

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
    // The lecture to record into (e.g. the board's selected one). Without
    // it, the upload is a new lecture of its own, filed under `course`.
    const rawLecture = req.headers['x-lecture-id']
    const lectureId = typeof rawLecture === 'string' && rawLecture !== '' ? rawLecture : null
    if (lectureId !== null && !BOARD_ID_RE.test(lectureId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad lecture id' }))
      return
    }
    // "1": select the new lecture this upload makes (no x-lecture-id) on the
    // x-workspace-id board, if that board still shows no lecture.
    const selectOnBoard = req.headers['x-select-on-board'] === '1' && lectureId === null && workspaceId !== null
    // The client's id for this capture or file, the same on every try of it:
    // a try after one that was saved (its answer lost) saves nothing new.
    const rawUploadId = req.headers['x-upload-id']
    const uploadId = typeof rawUploadId === 'string' && rawUploadId !== '' ? rawUploadId : null
    if (uploadId !== null && !UPLOAD_ID_RE.test(uploadId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad upload id' }))
      return
    }
    const parsedDuration = Math.round(Number(req.headers['x-recording-duration'] ?? '0'))
    const durationMs = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 0

    if (course && !isCourse(course)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unknown course' }))
      return
    }

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

    // Already saved by an earlier try: answer as that try would have. Before
    // the lecture check, as the lecture it went into is the answer, whatever
    // this try aimed at.
    const already = uploadId ? await savedUpload(userId, uploadId, selectOnBoard ? workspaceId : null) : null
    if (already) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(already))
      return
    }

    // Before the file is written: another student's lecture (or one that is
    // gone) is not found, and leaves nothing behind. Checked again, and held,
    // in the insert's transaction.
    if (lectureId && !(await ownsLecture(userId, lectureId))) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Lecture not found' }))
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

    let recordedInto: { lectureId: string; selected: boolean }
    try {
      recordedInto = await withUser(userId, async (tx) => {
        // An account's first upload may come before anything else it has sent.
        await ensureDefaultAutomations(tx, userId)
        // Into the given lecture, or a new lecture of its own filed under the
        // course (the lecture holds the course; the recording derives it).
        const intoLecture = lectureId
          ? (await requireOwnLecture(tx, userId, lectureId)).id
          : ((await tx`
              INSERT INTO lectures (user_id, title, course)
              VALUES (${userId}, ${title}, ${course ?? null})
              RETURNING id
            `)[0].id as string)
        const [inserted] = await tx`
          INSERT INTO recordings (id, user_id, lecture_id, title, duration, audio_url, status, upload_id)
          VALUES (${recordingId}, ${userId}, ${intoLecture}, ${title}, ${durationMs}, ${audioUrl}, 'uploaded', ${uploadId})
          ON CONFLICT (user_id, upload_id) WHERE upload_id IS NOT NULL DO NOTHING
          RETURNING id
        `
        // A concurrent try of this upload saved it first: undo this one
        // (with any lecture it made) and answer with that try's.
        if (!inserted) throw new AlreadySaved()
        // The server, not the widget, selects a lecture an upload makes, in
        // this transaction.
        const selected = selectOnBoard && (await selectNewLectureOnBoard(tx, userId, workspaceId!, intoLecture))
        await dispatchWorkflows(tx, userId, 'recording:completed', {
          recording_id: recordingId,
        }, workspaceId)
        return { lectureId: intoLecture, selected }
      })
    } catch (err) {
      // Nothing was recorded, so the file goes too.
      await rm(filePath, { force: true })
      const saved = err instanceof AlreadySaved && uploadId ? await savedUpload(userId, uploadId, selectOnBoard ? workspaceId : null) : null
      if (saved) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(saved))
        return
      }
      // The lecture went (or changed hands) between the check above and the
      // insert: still a 404, as if it had been gone all along.
      if (err instanceof TRPCError && err.code === 'NOT_FOUND') {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Lecture not found' }))
        return
      }
      throw err
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: recordingId, lectureId: recordedInto.lectureId, selected: recordedInto.selected, audioUrl }))
  } catch (err) {
    console.error('upload error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Upload failed' }))
  }
}
