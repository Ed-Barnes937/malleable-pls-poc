import http from 'http'
import { createReadStream, statSync } from 'fs'
import path from 'path'
import { createHTTPHandler } from '@trpc/server/adapters/standalone'
import cors from 'cors'
import { appRouter } from './router'
import { createContext } from './context'
import { startJobRunner } from './workflows/job-runner'
import { registerAllExecutors } from './workflows/executors'
import { handleUpload } from './upload'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')

const port = Number(process.env.PORT ?? 3001)

registerAllExecutors()

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

const trpcHandler = createHTTPHandler({
  router: appRouter,
  createContext,
  middleware: cors({ origin: ALLOWED_ORIGINS }),
})

function setUploadCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin ?? ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id, x-recording-title, x-recording-duration')
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/upload') || req.url?.startsWith('/uploads/')) {
    setUploadCors(req, res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.url.startsWith('/upload') && req.method === 'POST') {
      handleUpload(req, res)
    } else if (req.url.startsWith('/uploads/')) {
      const filename = path.basename(req.url)
      const filePath = path.join(UPLOADS_DIR, filename)
      try {
        const stat = statSync(filePath)
        res.writeHead(200, {
          'Content-Type': 'audio/webm',
          'Content-Length': stat.size,
        })
        createReadStream(filePath).pipe(res)
      } catch {
        res.writeHead(404)
        res.end()
      }
    }
  } else {
    trpcHandler(req, res)
  }
})

server.listen(port, '0.0.0.0')
startJobRunner()
console.log(`tRPC server listening on :${port}`)

export type { AppRouter } from './router'
