import type { IncomingMessage, ServerResponse } from 'http'
import { TRPCError } from '@trpc/server'
import { withUser } from '@pls/db'
import {
  MAX_RESOURCE_FILE_BYTES,
  matchesFileContent,
  resourceFileTypeByMime,
  titleFromFileName,
  type ResourceWithBody,
} from '@pls/substrate'
import { fileStore, newFileKey, type FileStore } from './file-store'
import { verifyFileUrl } from './file-url'
import { attachment, resourceAdded, resourceById } from './routers/resources'
import { isCourse, requireOwnBoard } from './routers/_shared'

const ID_RE = /^[a-zA-Z0-9_-]{1,255}$/
const MAX_NAME_LENGTH = 255
const MAX_COURSE_LENGTH = 100

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** A header the client URI-encoded (header values can't hold most file names), decoded and trimmed. */
function decodeHeader(value: string | string[] | undefined, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {}
  return decoded.trim().slice(0, maxLength) || null
}

/**
 * The name to remember a file by: no folders, no control characters. It is
 * only ever shown and offered back as a download name; it never reaches the
 * disk (files are stored under a generated key).
 */
export function cleanFileName(raw: string | null): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const name = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH)
  return name && name !== '.' && name !== '..' ? name : 'File'
}

class TooLarge extends Error {}

/** The request body, refusing more than `max` bytes. */
function collectBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > max) {
        reject(new TooLarge())
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * POST /resource-upload: one file per request, as the raw body, creating a
 * `file` resource (the same attachment and board rules as `createLink`).
 * Headers: Content-Type (the file's type), x-user-id, x-file-name (URI
 * encoded), and optionally x-lecture-id or x-resource-course (one of them)
 * and x-workspace-id. Answers with the resource.
 */
export async function handleResourceUpload(req: IncomingMessage, res: ServerResponse, store: FileStore = fileStore()) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  let key: string | null = null
  try {
    const userId = (req.headers['x-user-id'] as string) ?? 'anonymous'
    const type = resourceFileTypeByMime(req.headers['content-type'])
    if (!type) return json(res, 415, { error: "That file type isn't supported" })

    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > MAX_RESOURCE_FILE_BYTES) {
      // Answered without reading the body (Node discards it), and the
      // connection kept, so the browser can finish sending and read the 413.
      return json(res, 413, { error: `That file is over ${MAX_RESOURCE_FILE_BYTES / 1024 / 1024} MB` })
    }

    const name = cleanFileName(decodeHeader(req.headers['x-file-name'], MAX_NAME_LENGTH))
    const lectureId = decodeHeader(req.headers['x-lecture-id'], 255)
    const course = decodeHeader(req.headers['x-resource-course'], MAX_COURSE_LENGTH)
    const workspaceId = decodeHeader(req.headers['x-workspace-id'], 255)
    if ((lectureId && !ID_RE.test(lectureId)) || (workspaceId && !ID_RE.test(workspaceId))) {
      return json(res, 400, { error: 'Bad id' })
    }
    if (lectureId && course) return json(res, 400, { error: 'A resource goes under a lecture or a course, not both' })
    if (course && !isCourse(course)) return json(res, 400, { error: 'Unknown course' })

    let body: Buffer
    try {
      body = await collectBody(req, MAX_RESOURCE_FILE_BYTES)
    } catch (err) {
      if (err instanceof TooLarge) return json(res, 413, { error: `That file is over ${MAX_RESOURCE_FILE_BYTES / 1024 / 1024} MB` })
      throw err
    }
    if (body.length === 0) return json(res, 400, { error: 'That file is empty' })
    if (!matchesFileContent(type, body)) return json(res, 415, { error: `That file isn't a valid ${type.label} file` })

    key = newFileKey()
    await store.put(key, body)
    const fileKey = key

    let resource: ResourceWithBody
    try {
      resource = await withUser(userId, async (tx) => {
        if (workspaceId) await requireOwnBoard(tx, userId, workspaceId)
        const where = await attachment(tx, userId, lectureId, course)
        const [row] = await tx`
          INSERT INTO resources (user_id, kind, title, file_key, file_name, mime_type, size_bytes, lecture_id, course)
          VALUES (${userId}, 'file', ${titleFromFileName(name)}, ${fileKey}, ${name}, ${type.mime}, ${body.length},
                  ${where.lecture_id}, ${where.course})
          RETURNING id
        `
        const saved = (await resourceById(tx, userId, row.id as string))!
        await resourceAdded(tx, userId, saved, workspaceId)
        return saved
      })
    } catch (err) {
      // Nothing was saved, so the file goes too.
      await store.delete(fileKey).catch(() => {})
      key = null
      if (err instanceof TRPCError && (err.code === 'NOT_FOUND' || err.code === 'BAD_REQUEST')) {
        return json(res, err.code === 'NOT_FOUND' ? 404 : 400, { error: err.message })
      }
      throw err
    }

    json(res, 200, resource)
  } catch (err) {
    if (key) await store.delete(key).catch(() => {})
    console.error('resource upload error:', err)
    if (!res.headersSent) json(res, 500, { error: 'Upload failed' })
  }
}

/** A `Content-Disposition` for `name`: `attachment` or `inline`, with the name in an ASCII form and an RFC 5987 one. */
export function contentDisposition(disposition: 'attachment' | 'inline', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/**
 * GET /resource-files/<id>?u&exp&sig: streams a file to whoever holds a
 * link `resources.fileUrl` signed. The file's own type is sent (never
 * guessed), with `nosniff`, a sandboxing CSP, and `attachment` unless it is a
 * PDF or an image. A bad or expired link is 403; a file that is gone is 404.
 */
export async function handleResourceFile(req: IncomingMessage, res: ServerResponse, store: FileStore = fileStore()) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' })
  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    const id = decodeURIComponent(url.pathname.slice('/resource-files/'.length))
    const userId = verifyFileUrl(id, url.searchParams)
    if (!userId) return json(res, 403, { error: 'This link has expired' })

    const [row] = await withUser(userId, (tx) => tx`
      SELECT file_key, file_name, mime_type FROM resources
      WHERE id = ${id} AND user_id = ${userId} AND kind = 'file'
    `)
    const type = row && resourceFileTypeByMime(row.mime_type as string)
    const file = row && type ? await store.stream(row.file_key as string) : null
    if (!row || !type || !file) return json(res, 404, { error: 'File not found' })

    res.writeHead(200, {
      'Content-Type': type.mime.startsWith('text/') ? `${type.mime}; charset=utf-8` : type.mime,
      'Content-Length': file.size,
      'Content-Disposition': contentDisposition(type.inline ? 'inline' : 'attachment', (row.file_name as string | null) ?? 'file'),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    })
    file.stream.on('error', () => res.destroy())
    file.stream.pipe(res)
  } catch (err) {
    console.error('resource file error:', err)
    if (!res.headersSent) json(res, 500, { error: 'Could not open that file' })
  }
}
