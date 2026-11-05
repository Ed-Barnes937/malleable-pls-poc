import { useSyncExternalStore } from 'react'

/**
 * A way for the shell (the top bar's "Plan my week") to ask a Calendar to open
 * Help me plan in Week view. The Calendar may not exist yet (it is being added
 * to the board), so the request waits for the first Calendar that mounts or is
 * already on screen, and is taken by exactly one of them. A request nobody
 * takes (the add failed) expires, so it never opens Help me plan later, out
 * of the blue.
 */
export const PLAN_REQUEST_TTL_MS = 15_000

let pendingSince: number | null = null
let version = 0
const listeners = new Set<() => void>()

/** Asks a Calendar to open Help me plan in Week view, this week. */
export function requestHelpMePlan(): void {
  pendingSince = Date.now()
  version += 1
  for (const fn of listeners) fn()
}

/** True once per request, for the Calendar that acts on it. */
export function takeHelpMePlanRequest(): boolean {
  const since = pendingSince
  pendingSince = null
  return since != null && Date.now() - since <= PLAN_REQUEST_TTL_MS
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Changes whenever a request is made: a Calendar's effect keys on it, then calls `takeHelpMePlanRequest`. */
export function useHelpMePlanRequest(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0)
}
