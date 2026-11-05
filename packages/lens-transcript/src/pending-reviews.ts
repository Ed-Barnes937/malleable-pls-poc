import { useCallback, useEffect, useState } from 'react'

/**
 * How long a moment says "Planning a review..." before it says "No review
 * yet": the review automation normally answers in a second or two (an AI
 * call for the title), and a failed run tells nobody else. A review that
 * arrives later still takes its place.
 */
export const REVIEW_WAIT_MS = 20_000

/**
 * `planning`: the automation is on it. `late`: it hasn't answered in
 * REVIEW_WAIT_MS (slow or failed; one may still come). `none`: no review is
 * coming (no automation started for it).
 */
export type PendingReview = 'planning' | 'late' | 'none'

interface Entry {
  state: PendingReview
  since: number
}

/**
 * Moments marked confusing whose review hasn't shown up yet (flow-audit 03:
 * pending work shows at once and resolves in place). `mark` when the tag is
 * sent, `started` with how many automations it started (0: none will plan
 * one), `failed` if the tag didn't save. An entry goes once the moment has
 * its review (`hasReview`), so the review chip takes its place.
 */
export function usePendingReviews(hasReview: (segmentId: string) => boolean) {
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(new Map())

  const set = useCallback((segmentId: string, entry: Entry | null) => {
    setEntries((prev) => {
      const next = new Map(prev)
      if (entry) next.set(segmentId, entry)
      else next.delete(segmentId)
      return next
    })
  }, [])

  const mark = useCallback((segmentId: string) => set(segmentId, { state: 'planning', since: Date.now() }), [set])
  const started = useCallback((segmentId: string, automations: number) => {
    if (automations === 0) set(segmentId, { state: 'none', since: Date.now() })
  }, [set])
  const failed = useCallback((segmentId: string) => set(segmentId, null), [set])

  // Planning says "No review yet" after REVIEW_WAIT_MS.
  useEffect(() => {
    const planning = [...entries].filter(([, e]) => e.state === 'planning')
    if (planning.length === 0) return
    const next = Math.min(...planning.map(([, e]) => e.since + REVIEW_WAIT_MS))
    const t = setTimeout(() => {
      setEntries((prev) => {
        const now = Date.now()
        const out = new Map(prev)
        for (const [id, e] of prev) if (e.state === 'planning' && e.since + REVIEW_WAIT_MS <= now) out.set(id, { state: 'late', since: now })
        return out
      })
    }, Math.max(0, next - Date.now()))
    return () => clearTimeout(t)
  }, [entries])

  // The review arrived (late or not): it shows instead.
  useEffect(() => {
    const arrived = [...entries.keys()].filter(hasReview)
    if (arrived.length === 0) return
    setEntries((prev) => {
      const out = new Map(prev)
      for (const id of arrived) out.delete(id)
      return out
    })
  }, [entries, hasReview])

  const stateOf = useCallback((segmentId: string): PendingReview | null => entries.get(segmentId)?.state ?? null, [entries])
  return { mark, started, failed, stateOf }
}
