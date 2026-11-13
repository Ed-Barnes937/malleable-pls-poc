import type { IncomingMessage, ServerResponse } from 'http'
import { createReadStream, statSync } from 'fs'
import path from 'path'
import { AUDIO_CONTENT_TYPES } from './upload'
import { uploadsDir } from './file-store'

/**
 * GET /uploads/<name>: a recording's audio. Only regular files directly in
 * the uploads folder are served (a folder such as `.` or `resources` is a
 * 404), and a stream that fails mid-way ends the response instead of
 * crashing the server.
 */
export function handleUploadedFile(req: IncomingMessage, res: ServerResponse): void {
  const dir = uploadsDir()
  const filename = path.basename(req.url ?? '')
  const filePath = path.join(dir, filename)

  // Path traversal protection: resolved path must stay inside the uploads folder
  if (!path.resolve(filePath).startsWith(path.resolve(dir))) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Forbidden' }))
    return
  }

  let size: number
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) throw new Error('Not a file')
    size = stat.size
  } catch {
    res.writeHead(404)
    res.end()
    return
  }

  res.writeHead(200, {
    'Content-Type': AUDIO_CONTENT_TYPES[path.extname(filename).slice(1)] ?? 'application/octet-stream',
    'Content-Length': size,
  })
  const stream = createReadStream(filePath)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}
