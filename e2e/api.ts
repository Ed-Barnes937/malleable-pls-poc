import type { APIRequestContext } from '@playwright/test'
import { isClassBlock } from '../packages/substrate/src/class-occurrences'
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

/**
 * Deletes the student's class blocks of `course` (e.g. the reseeded weekly
 * Chemistry lecture), so Record on a board of that course makes a fresh
 * lecture whatever the time: the server joins a class that is on (02 phase
 * 3), and the seeded week has one on at fixed times every week.
 */
export async function deleteClassesOf(request: APIRequestContext, course: string): Promise<void> {
  const items = await trpcQuery<{ id: string; kind: string; subtype: string | null; course: string | null }[]>(
    request, 'planItems.list', { kinds: ['commitment'], courseTag: course },
  )
  const classes = items.filter((p) => isClassBlock(p) && p.course === course)
  for (const item of classes) await trpcMutation(request, 'planItems.delete', item.id)
  const left = await trpcQuery<{ id: string; kind: string; subtype: string | null; course: string | null }[]>(
    request, 'planItems.list', { kinds: ['commitment'], courseTag: course },
  )
  if (left.some(isClassBlock)) throw new Error(`${course} still has class blocks`)
}
