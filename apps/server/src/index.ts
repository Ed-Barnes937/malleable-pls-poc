import http from 'http'
import { createHTTPHandler } from '@trpc/server/adapters/standalone'
import cors from 'cors'
import { appRouter } from './router'
import { createContextFactory } from './context'
import { trpcErrorLine } from './trpc-error-log'
import { createAiDeps, describeAiDeps } from './ai/deps'
import { startJobRunner } from './workflows/job-runner'
import { createServerExecutors } from './workflows/executors'
import { handleUpload } from './upload'
import { handleUploadedFile } from './serve-upload'
import { handleResourceFile, handleResourceUpload } from './resource-upload'

const port = Number(process.env.PORT ?? 3001)
const isProduction = process.env.NODE_ENV === 'production'

// The single place AI clients are constructed; everything else receives them.
const ai = createAiDeps()
console.log(describeAiDeps(ai))
const executors = createServerExecutors(ai)

// ---------------------------------------------------------------------------
// Rate limiter (sliding window, per-IP)
//
// In-memory and therefore single-process only: each server instance keeps its
// own buckets, so limits multiply by instance count behind a load balancer.
// Swap for a shared store (e.g. Redis) before scaling horizontally.
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000 // 1 minute
const UPLOAD_RATE_LIMIT = 10   // requests per window for /upload and /resource-upload (one shared bucket)
const GENERAL_RATE_LIMIT = 100 // requests per window for everything else

// e2e runs hammer the API from one IP and trip the general limit mid-suite,
// surfacing as silent 429s. The Playwright webServer sets this to opt out.
const RATE_LIMIT_DISABLED = process.env.DISABLE_RATE_LIMIT === '1'

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
  if (RATE_LIMIT_DISABLED) return true
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
  createContext: createContextFactory({ ai, executors }),
  middleware: cors({ origin: (incoming, cb) => cb(null, isAllowedOrigin(incoming ?? '')) }),
  // Every failed call reaches the server log (and so the Fly logs) as one
  // line: the procedure and the error, never the input (see trpcErrorLine).
  onError: ({ path, type, error }) => {
    const line = trpcErrorLine(type, path, error)
    if (error.code === 'INTERNAL_SERVER_ERROR') console.error(line)
    else console.warn(line)
  },
})

function setUploadCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin ?? ''
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-recording-title, x-recording-duration, x-recording-course, x-workspace-id, x-lecture-id, x-select-on-board, x-upload-id, x-file-name, x-resource-course')
}

// ---------------------------------------------------------------------------
// Bearer token auth
// ---------------------------------------------------------------------------
const AUTH_TOKEN = process.env.AUTH_TOKEN

function checkBearerToken(req: http.IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true
  const header = req.headers.authorization
  if (header === `Bearer ${AUTH_TOKEN}`) return true

  // SSE subscriptions (EventSource) can't set headers — token arrives in connectionParams query param
  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    const params = url.searchParams.get('connectionParams')
    if (params) {
      const parsed = JSON.parse(params)
      if (parsed.Authorization === `Bearer ${AUTH_TOKEN}`) return true
    }
  } catch {}

  return false
}

const server = http.createServer((req, res) => {
  // Security headers on every response
  setSecurityHeaders(res)

  // Unauthenticated readiness probe (used by the Playwright webServer config).
  // `aiMode` lets test tooling refuse to run against a live-AI server.
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, aiMode: ai.mode }))
    return
  }

  // Bearer token auth (before rate limiting so invalid requests don't consume quota)
  // A signed file link is opened in a new tab, which can't send the token: the
  // link's signature (checked by the route) is its credential.
  const isFileLink = req.method === 'GET' && (req.url?.startsWith('/resource-files/') ?? false)
  if (req.method === 'OPTIONS' || isFileLink) {
    // Allow CORS preflight through — the CORS handler will gate the actual request
  } else if (!checkBearerToken(req)) {
    const origin = req.headers.origin ?? ''
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  // Rate limiting
  const clientIp = getClientIp(req)
  const isUploadRoute = (req.url?.startsWith('/upload') || req.url?.startsWith('/resource-upload')) ?? false
  if (!checkRateLimit(clientIp, isUploadRoute)) {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }))
    return
  }

  if (req.url?.startsWith('/resource-upload') || req.url?.startsWith('/resource-files/')) {
    setUploadCors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
    } else if (req.url.startsWith('/resource-upload')) {
      void handleResourceUpload(req, res)
    } else {
      void handleResourceFile(req, res)
    }
  } else if (req.url?.startsWith('/upload') || req.url?.startsWith('/uploads/')) {
    setUploadCors(req, res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.url.startsWith('/upload') && req.method === 'POST') {
      handleUpload(req, res)
    } else if (req.url.startsWith('/uploads/')) {
      handleUploadedFile(req, res)
    }
  } else {
    trpcHandler(req, res)
  }
})

// Keep idle connections open longer than clients do (Node's default is 5s):
// otherwise a client can reuse a socket at the moment the server closes it,
// and that request fails with "socket hang up".
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000

server.listen(port, '0.0.0.0')
void startJobRunner(executors)
console.log(`tRPC server listening on :${port}`)

export type { AppRouter } from './router'
