import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/** How long a signed file link works. */
export const FILE_URL_TTL_MS = 5 * 60_000

// A secret per process unless one is set: links then stop working on restart,
// which is fine for a five minute link. Set FILE_URL_SECRET to keep them
// valid across restarts or machines.
const fallbackSecret = randomBytes(32).toString('hex')
const secret = () => process.env.FILE_URL_SECRET || fallbackSecret

function signature(id: string, userId: string, exp: number): string {
  return createHmac('sha256', secret()).update(JSON.stringify([id, userId, exp])).digest('base64url')
}

/**
 * The path (and query) a student opens to see their file: `/resource-files/<id>`
 * with the student, an expiry and an HMAC over all three. The link is the only
 * credential the route checks, since a new tab can't send headers; the student
 * is in it because the row is read as them (row-level security).
 */
export function signFileUrl(id: string, userId: string, now = Date.now()): string {
  const exp = now + FILE_URL_TTL_MS
  const query = new URLSearchParams({ u: userId, exp: String(exp), sig: signature(id, userId, exp) })
  return `/resource-files/${encodeURIComponent(id)}?${query}`
}

/** The student a signed link was made for, or null if it is forged, altered or expired. */
export function verifyFileUrl(id: string, params: URLSearchParams, now = Date.now()): string | null {
  const userId = params.get('u')
  const exp = Number(params.get('exp'))
  const sig = params.get('sig')
  if (!userId || !sig || !Number.isFinite(exp) || exp < now) return null
  const expected = Buffer.from(signature(id, userId, exp))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return userId
}
