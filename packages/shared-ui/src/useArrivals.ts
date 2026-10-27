import { useEffect, useRef, useState } from 'react'

/**
 * Ids that appeared after the list first loaded, e.g. a review the
 * automation just added, so it can be animated in. What was there on first
 * load (or after `resetKey` changes, e.g. another lecture or course) never
 * counts. No clocks involved, so it is the same on any device.
 */
export function useArrivals(ids: ReadonlyArray<string> | undefined, resetKey: string): ReadonlySet<string> {
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null)
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set())
  const joined = ids?.join('\n')
  useEffect(() => {
    if (joined === undefined) return
    const current = joined ? joined.split('\n') : []
    if (!seen.current || seen.current.key !== resetKey) {
      seen.current = { key: resetKey, ids: new Set(current) }
      setArrived((prev) => (prev.size ? new Set() : prev))
      return
    }
    const fresh = current.filter((id) => !seen.current!.ids.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) seen.current.ids.add(id)
    setArrived((prev) => new Set([...prev, ...fresh]))
  }, [joined, resetKey])
  return arrived
}
