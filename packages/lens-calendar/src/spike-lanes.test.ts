// SPIKE (K0 spike 2): does @ui-sdk/core stackSpans give the same lanes as layoutDays' assignColumns?
import { describe, it, expect } from 'vitest'
import { stackSpans } from '@ui-sdk/core'
import type { PlanItemOccurrence } from '@pls/substrate'
import { layoutDays } from './layout'
import { addDays } from './time'

const monday = new Date(2026, 9, 26)
const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
const at = (day: number, min: number) => new Date(2026, 9, 26 + day, 0, min).toISOString()
function row(i: number, day: number, from: number, to: number): PlanItemOccurrence {
  const id = `p${String(i).padStart(3, '0')}`
  return {
    id, kind: 'task', title: id, starts_at: at(day, from), ends_at: at(day, to), due_at: null, duration_min: to - from,
    status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null, course: null,
    created_at: at(0, 0), updated_at: at(0, 0), occurrence_key: id, series_starts_at: at(day, from), series_ends_at: at(day, to), series_due_at: null,
  } as PlanItemOccurrence
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

describe('stackSpans vs assignColumns', () => {
  it('matches lane and lane count for 500 random weeks of overlapping blocks', () => {
    let segments = 0
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed)
      const rows = Array.from({ length: 4 + Math.floor(r() * 20) }, (_, i) => {
        const from = Math.floor(r() * 80) * 15 + 6 * 60
        return row(i, Math.floor(r() * 7), from, from + (1 + Math.floor(r() * 12)) * 15)
      })
      const ours = layoutDays(rows, week).flat()
      // Same order layoutDays breaks ties in (by key), as spans keyed by segment.
      const spans = [...ours].sort((a, b) => a.key.localeCompare(b.key)).map((s) => ({ id: s.key, track: String(s.dayIndex), start: s.startMin, end: s.endMin }))
      const lanes = stackSpans(spans)
      for (const s of ours) {
        expect(lanes.get(s.key), `seed ${seed} ${s.key}`).toEqual({ lane: s.column, lanes: s.columns })
        segments++
      }
    }
    expect(segments).toBeGreaterThan(5000)
  })
})
