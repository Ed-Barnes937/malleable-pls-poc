import type { APIRequestContext } from '@playwright/test'
import { apiUrl } from './ports'

// Minimal tRPC-over-HTTP helper for journeys that need to arrange or check
// data the UI under test does not show yet (e.g. seed a shift, read back a
// placement). Same user and wire format (superjson) as the web app.

const headers = (userId: string) => ({ 'x-user-id': userId, 'content-type': 'application/json' })

export async function trpcQuery<T>(request: APIRequestContext, path: string, input?: unknown, userId = 'dev-user-1'): Promise<T> {
  const query = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
  const res = await request.get(`${apiUrl}/${path}${query}`, { headers: headers(userId) })
  if (!res.ok()) throw new Error(`${path} failed: ${res.status()} ${await res.text()}`)
  return ((await res.json()) as { result: { data: { json: T } } }).result.data.json
}

export async function trpcMutation<T>(request: APIRequestContext, path: string, input: unknown, userId = 'dev-user-1'): Promise<T> {
  const res = await request.post(`${apiUrl}/${path}`, { headers: headers(userId), data: { json: input } })
  if (!res.ok()) throw new Error(`${path} failed: ${res.status()} ${await res.text()}`)
  return ((await res.json()) as { result: { data: { json: T } } }).result.data.json
}
