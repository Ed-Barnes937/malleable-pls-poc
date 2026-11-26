import { useSyncExternalStore } from 'react'

/**
 * A way for the shell (the top bar's "Plan my week") to ask one Calendar to open
 * Help me plan in Week view. The request names that Calendar's `panelId`: the
 * Calendar may not be on screen yet (it was just added), so the request waits
 * for it, and only that Calendar takes it (never one on another board). A
 * request nobody takes (the board was left) expires, so it never opens Help me
 * plan later, out of the blue.
 */
export const PLAN_REQUEST_TTL_MS = 15_000

let pending: { panelId: string; since: number } | null = null
let version = 0
const listeners = new Set<() => void>()

/** Asks the Calendar with this `panelId` to open Help me plan in Week view, this week. */
export function requestHelpMePlan(panelId: string): void {
  pending = { panelId, since: Date.now() }
  version += 1
  for (const fn of listeners) fn()
}

/** True once per request, for the Calendar it names. */
export function takeHelpMePlanRequest(panelId: string): boolean {
  if (pending?.panelId !== panelId) return false
  const { since } = pending
  pending = null
  return Date.now() - since <= PLAN_REQUEST_TTL_MS
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
