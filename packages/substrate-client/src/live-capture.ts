import { useCallback, useSyncExternalStore } from 'react'
import type { LiveCapturePhase } from '@pls/lens-framework'

/**
 * Captures in progress on this device, by lecture: the Record widget
 * reports them, any widget (e.g. the Transcript's "Recording...") reads
 * them. Device-local and never persisted: a capture is audio in this
 * browser until its upload lands, so it lives exactly as long as the page.
 * A server-backed version (another device showing "Recording...") can
 * replace this behind the same substrate hooks.
 */
const captures = new Map<string, LiveCapturePhase>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setLiveCapture(lectureId: string, phase: LiveCapturePhase | null): void {
  if ((captures.get(lectureId) ?? null) === phase) return
  if (phase) captures.set(lectureId, phase)
  else captures.delete(lectureId)
  for (const listener of listeners) listener()
}

export function useLiveCaptureOf(lectureId: string | undefined): LiveCapturePhase | null {
  const read = useCallback(() => (lectureId ? captures.get(lectureId) ?? null : null), [lectureId])
  return useSyncExternalStore(subscribe, read, read)
}
