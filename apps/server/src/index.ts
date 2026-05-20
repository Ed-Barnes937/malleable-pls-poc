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
const isProduction = process.env.NODE_ENV === 'production'

registerAllExecutors()

// ---------------------------------------------------------------------------
// Rate limiter (sliding window, per-IP)
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000 // 1 minute
const UPLOAD_RATE_LIMIT = 10   // requests per window for /upload
const GENERAL_RATE_LIMIT = 100 // requests per window for everything else

interface RateBucket {
  timestamps: number[]
}

const rateBuckets = new Map<string, RateBucket>()

// Periodically purge stale entries so the map doesn't grow unbounded
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS
  for (const [key, bucket] of rateBuckets) {
    bucket.timestamps = bucket.timestamps.filter(t => t > cutoff)
    if (bucket.timestamps.length === 0) rateBuckets.delete(key)
  }
}, RATE_WINDOW_MS)

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress ?? 'unknown'
}

/** Returns true if the request is within limits, false if it should be rejected. */
function checkRateLimit(ip: string, isUpload: boolean): boolean {
  const limit = isUpload ? UPLOAD_RATE_LIMIT : GENERAL_RATE_LIMIT
  const key = isUpload ? `upload:${ip}` : `general:${ip}`
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS

  let bucket = rateBuckets.get(key)
  if (!bucket) {
    bucket = { timestamps: [] }
    rateBuckets.set(key, bucket)
  }

  // Drop timestamps outside the current window
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff)

  if (bucket.timestamps.length >= limit) return false

  bucket.timestamps.push(now)
  return true
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
function setSecurityHeaders(res: http.ServerResponse) {
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
  res.setHeader('Content-Security-Policy', "default-src 'self'")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '0')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
}

// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

const ALLOWED_ORIGIN_SUFFIX = process.env.ALLOWED_ORIGIN_SUFFIX ?? ''

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  if (ALLOWED_ORIGIN_SUFFIX && origin.startsWith('https://') && origin.endsWith(ALLOWED_ORIGIN_SUFFIX)) return true
  return false
}

const trpcHandler = createHTTPHandler({
  router: appRouter,
  createContext,
  middleware: cors({ origin: (incoming, cb) => cb(null, isAllowedOrigin(incoming ?? '')) }),
})

function setUploadCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin ?? ''
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-recording-title, x-recording-duration')
}

// ---------------------------------------------------------------------------
// Bearer token auth
// ---------------------------------------------------------------------------
const AUTH_TOKEN = process.env.AUTH_TOKEN

function checkBearerToken(req: http.IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true
  const header = req.headers.authorization
  return header === `Bearer ${AUTH_TOKEN}`
}

const server = http.createServer((req, res) => {
  // Security headers on every response
  setSecurityHeaders(res)

  // Bearer token auth (before rate limiting so invalid requests don't consume quota)
  if (req.method === 'OPTIONS') {
    // Allow CORS preflight through — the CORS handler will gate the actual request
  } else if (!checkBearerToken(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  // Rate limiting
  const clientIp = getClientIp(req)
  const isUploadRoute = req.url?.startsWith('/upload') ?? false
  if (!checkRateLimit(clientIp, isUploadRoute)) {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }))
    return
  }

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

      // Path traversal protection: resolved path must stay inside UPLOADS_DIR
      if (!path.resolve(filePath).startsWith(path.resolve(UPLOADS_DIR))) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Forbidden' }))
        return
      }

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
