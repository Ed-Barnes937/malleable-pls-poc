/**
 * Half-open time intervals `[start, end)` in UTC epoch milliseconds.
 *
 * Every interval the scheduler returns is normalized: non-empty, sorted by
 * start, and disjoint (overlapping or touching intervals are merged).
 */
export interface Interval {
  start: number
  end: number
}

export const MINUTE_MS = 60_000

/** Drop empty/invalid intervals, sort, and merge overlapping or touching ones. */
export function normalize(intervals: ReadonlyArray<Interval>): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Interval[] = []
  for (const cur of sorted) {
    const last = out[out.length - 1]
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else out.push(cur)
  }
  return out
}

/** `from` minus `remove`. Inputs need not be normalized; the result is. */
export function subtract(
  from: ReadonlyArray<Interval>,
  remove: ReadonlyArray<Interval>,
): Interval[] {
  const a = normalize(from)
  const r = normalize(remove)
  const out: Interval[] = []
  let j = 0
  for (const slot of a) {
    let cur = slot.start
    // `a` and `r` are sorted and disjoint, so anything ending before this slot
    // also ends before every later slot.
    while (j < r.length && r[j].end <= cur) j++
    for (let k = j; k < r.length && r[k].start < slot.end; k++) {
      if (r[k].start > cur) out.push({ start: cur, end: r[k].start })
      cur = Math.max(cur, r[k].end)
    }
    if (cur < slot.end) out.push({ start: cur, end: slot.end })
  }
  return out
}

/** Total length of the (normalized) intervals, in whole minutes, rounded down. */
export function totalMinutes(intervals: ReadonlyArray<Interval>): number {
  const ms = normalize(intervals).reduce((sum, i) => sum + (i.end - i.start), 0)
  return Math.floor(ms / MINUTE_MS)
}
