import { useLayoutEffect, useRef } from 'react'

/**
 * Ids that appeared after the list first loaded, e.g. a review the
 * automation just added, so it can be animated in. What was there on first
 * load (or after `resetKey` changes, e.g. another lecture or course) never
 * counts. No clocks involved, so it is the same on any device. Known on the
 * render an id first appears in, so its element mounts already arriving and
 * never shows for a frame before its motion starts.
 */
export function useArrivals(ids: ReadonlyArray<string> | undefined, resetKey: string): ReadonlySet<string> {
  // Worked out while rendering, from refs only: a render React repeats (or
  // throws away) sees the same answer, as ids only ever join `seen`.
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null)
  const arrived = useRef<ReadonlySet<string>>(new Set())
  if (ids !== undefined) {
    if (!seen.current || seen.current.key !== resetKey) {
      seen.current = { key: resetKey, ids: new Set(ids) }
      if (arrived.current.size) arrived.current = new Set()
    } else {
      const fresh = ids.filter((id) => !seen.current!.ids.has(id))
      if (fresh.length) {
        for (const id of fresh) seen.current.ids.add(id)
        arrived.current = new Set([...arrived.current, ...fresh])
      }
    }
  }
  return arrived.current
}

/**
 * For things that can mount again without arriving again (a block dragged to
 * another day, a row moving to the done list): whether the one with `key`
 * should show its arrival as it mounts now. True from the render it arrives
 * in until that render is on screen, so each arrival plays once; capture it
 * at mount (e.g. `useState(entering(key))`), as it turns false after.
 */
export function useEnterOnce(arrived: ReadonlySet<string>): (key: string) => boolean {
  const played = useRef<ReadonlySet<string>>(new Set())
  useLayoutEffect(() => {
    const fresh = [...arrived].filter((key) => !played.current.has(key))
    // A new set, so what this render was told stays as it was.
    if (fresh.length) played.current = new Set([...played.current, ...fresh])
  })
  const done = played.current
  return (key) => arrived.has(key) && !done.has(key)
}
