// Lanes from UI SDK's stackSpans (layoutDays) match the greedy column packing
// the grid used before K4a1, kept here as the reference.
import { describe, it, expect } from 'vitest'
import type { PlanItemOccurrence } from '@pls/substrate'
import { layoutDays, type DaySegment } from './layout'
import { addDays } from './time'

const monday = new Date(2026, 9, 26)
const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
const at = (day: number, min: number) => new Date(2026, 9, 26 + day, 0, min).toISOString()
function row(i: number, day: number, from: number, to: number): PlanItemOccurrence {
  const id = `p${i}`
  return {
    id, kind: 'task', title: id, starts_at: at(day, from), ends_at: at(day, to), due_at: null, duration_min: to - from,
    status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null, course: null,
    created_at: at(0, 0), updated_at: at(0, 0), occurrence_key: id, series_starts_at: at(day, from), series_ends_at: at(day, to), series_due_at: null,
  } as PlanItemOccurrence
}

/** The grid's packing before K4a1: greedy columns within each cluster of transitively overlapping segments. */
function referenceColumns(segments: DaySegment[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.key.localeCompare(b.key))
  const out = new Map<string, { lane: number; lanes: number }>()
  let cluster: string[] = []
  let ends: number[] = []
  let clusterEnd = -Infinity
  const close = () => {
    for (const key of cluster) out.get(key)!.lanes = ends.length
    cluster = []
    ends = []
  }
  for (const seg of sorted) {
    if (seg.startMin >= clusterEnd) close()
    let lane = ends.findIndex((end) => end <= seg.startMin)
    if (lane === -1) {
      lane = ends.length
      ends.push(seg.endMin)
    } else ends[lane] = seg.endMin
    out.set(seg.key, { lane, lanes: 0 })
    cluster.push(seg.key)
    clusterEnd = Math.max(clusterEnd, seg.endMin)
  }
  close()
  return out
}

// Deterministic pseudo-random weeks (mulberry32), on the quarter hour like the grid.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('layoutDays lanes (stackSpans)', () => {
  it('match the old greedy packing for 500 random weeks of overlapping blocks', () => {
    let segments = 0
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed)
      const rows = Array.from({ length: 4 + Math.floor(r() * 20) }, (_, i) => {
        const from = Math.floor(r() * 80) * 15 + 6 * 60
        return row(i, Math.floor(r() * 7), from, from + (1 + Math.floor(r() * 12)) * 15)
      })
      for (const day of layoutDays(rows, week)) {
        const expected = referenceColumns(day)
        for (const s of day) {
          expect({ lane: s.column, lanes: s.columns }, `seed ${seed} ${s.key}`).toEqual(expected.get(s.key))
          segments++
        }
      }
    }
    expect(segments).toBeGreaterThan(5000)
  })
})
