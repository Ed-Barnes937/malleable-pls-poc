/**
 * Property-style tests: random (but seeded, so deterministic) weeks of
 * commitments, accepted blocks and tasks, checking the invariants every
 * caller relies on.
 */
import { describe, expect, it } from 'vitest'
import { capacity } from './capacity'
import { freeSlots } from './free-slots'
import { MINUTE_MS, normalize, type Interval } from './intervals'
import { place, refit, suggestSlots, type ExistingPlacement, type SchedulerTask } from './place'

/** mulberry32: tiny seeded PRNG. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ZONES = ['UTC', 'Europe/London', 'America/New_York', 'Australia/Sydney', 'Asia/Kathmandu']
// Spans the 2026 London/US autumn DST changes.
const BASE = Date.parse('2026-10-19T00:00:00Z')
const DAY = 24 * 60 * MINUTE_MS

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end
const inside = (a: Interval, slots: Interval[]) => slots.some((s) => s.start <= a.start && a.end <= s.end)

function scenario(seed: number) {
  const r = rng(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  const range = { start: BASE + int(0, 14) * DAY, end: 0 }
  range.end = range.start + int(1, 9) * DAY
  const at = () => range.start + int(0, (range.end - range.start) / MINUTE_MS) * MINUTE_MS
  const commitments = Array.from({ length: int(0, 25) }, () => {
    const start = at()
    return { start, end: start + int(15, 300) * MINUTE_MS }
  })
  const prefs = {
    timeZone: ZONES[int(0, ZONES.length - 1)],
    dayStart: `${String(int(6, 10)).padStart(2, '0')}:${['00', '30'][int(0, 1)]}`,
    dayEnd: `${String(int(17, 23)).padStart(2, '0')}:00`,
    bufferMin: [0, 5, 10, 15][int(0, 3)],
    minSlotMin: [0, 15, 30][int(0, 2)],
  }
  const free = freeSlots(commitments, range, prefs)
  const existing: ExistingPlacement[] = Array.from({ length: int(0, 4) }, (_, i) => {
    const start = at()
    return { taskId: `accepted-${i}`, start, end: start + int(20, 120) * MINUTE_MS }
  })
  const tasks: SchedulerTask[] = Array.from({ length: int(0, 12) }, (_, i) => {
    const t: SchedulerTask = { id: `t${i}`, durationMin: [-5, 0, 10, 20, 25, 30, 45, 60, 90, 120, 240][int(0, 10)] }
    if (r() < 0.4) t.earliest = at()
    if (r() < 0.6) t.latest = at()
    return t
  })
  const now = at()
  const policy = r() < 0.5 ? ('priority' as const) : ('deadline' as const)
  const anchor = r() < 0.5 ? ('earliest' as const) : ('latest' as const)
  // Occasionally repeat an id to exercise duplicate handling.
  if (tasks.length > 1 && r() < 0.15) tasks.push({ ...tasks[0], durationMin: 30 })
  return { range, commitments, prefs, free, existing, tasks, now, policy, anchor, alignMin: [1, 5, 15, 30][int(0, 3)] }
}

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1)

describe('scheduler properties', () => {
  it('free slots are normalized, inside the range, clear of buffered commitments and long enough', () => {
    for (const seed of SEEDS) {
      const { range, commitments, prefs, free } = scenario(seed)
      expect(normalize(free)).toEqual(free)
      for (const s of free) {
        expect(s.start).toBeGreaterThanOrEqual(range.start)
        expect(s.end).toBeLessThanOrEqual(range.end)
        expect(s.end - s.start).toBeGreaterThanOrEqual(prefs.minSlotMin * MINUTE_MS)
        for (const c of commitments) {
          const b = prefs.bufferMin * MINUTE_MS
          expect(overlaps(s, { start: c.start - b, end: c.end + b })).toBe(false)
        }
      }
    }
  })

  it('placements stay in free time and windows, never overlap, and every task is accounted for', () => {
    for (const seed of SEEDS) {
      const { free, existing, tasks, now, policy, anchor, alignMin } = scenario(seed)
      const { placements, unplaced } = place(tasks, free, { now, existingPlacements: existing, policy, anchor, alignMin })

      expect([...placements.map((p) => p.taskId), ...unplaced.map((u) => u.taskId)].sort()).toEqual(
        tasks.map((t) => t.id).sort(),
      )
      // Each id is placed at most once.
      expect(new Set(placements.map((p) => p.taskId)).size).toBe(placements.length)
      for (const p of placements) {
        const t = tasks.find((x) => x.id === p.taskId)!
        expect(inside(p, free)).toBe(true)
        expect(p.end - p.start).toBe(t.durationMin * MINUTE_MS)
        expect(p.start).toBeGreaterThanOrEqual(Math.max(now, t.earliest ?? now))
        expect(p.end).toBeLessThanOrEqual(t.latest ?? Infinity)
        expect(p.start % (alignMin * MINUTE_MS)).toBe(0)
        for (const e of existing) expect(overlaps(p, e)).toBe(false)
        for (const q of placements) if (q !== p) expect(overlaps(p, q)).toBe(false)
      }
    }
  })

  it('an unplaced no-free-slot task really had no room left (earliest-fit is complete)', () => {
    for (const seed of SEEDS) {
      const { free, existing, tasks, now, anchor, alignMin } = scenario(seed)
      const { placements, unplaced } = place(tasks, free, { now, existingPlacements: existing, anchor, alignMin })
      for (const u of unplaced.filter((x) => x.reason === 'no-free-slot')) {
        const t = tasks.find((x) => x.id === u.taskId)!
        const others = [...existing, ...placements]
        expect(suggestSlots(t, free, 1, { now, existingPlacements: others, alignMin })).toEqual([])
      }
    }
  })

  it('is deterministic and idempotent', () => {
    for (const seed of SEEDS) {
      const { free, existing, tasks, now, policy, anchor } = scenario(seed)
      const opts = { now, existingPlacements: existing, policy, anchor }
      const first = place(tasks, free, opts)
      expect(place(tasks, free, opts)).toEqual(first)
      expect(place(tasks, free, { ...opts, existingPlacements: [...existing, ...first.placements] })).toEqual(first)
    }
  })

  it('suggestions are valid placements in the anchor order, at most one per free gap', () => {
    for (const seed of SEEDS) {
      const { free, existing, tasks, now, anchor } = scenario(seed)
      for (const t of tasks) {
        const s = suggestSlots(t, free, 5, { now, existingPlacements: existing, anchor })
        expect(s.length).toBeLessThanOrEqual(5)
        for (let i = 0; i < s.length; i++) {
          expect(inside(s[i], free)).toBe(true)
          for (const e of existing) expect(overlaps(s[i], e)).toBe(false)
          if (i > 0 && anchor === 'earliest') expect(s[i].start).toBeGreaterThanOrEqual(s[i - 1].end)
          if (i > 0 && anchor === 'latest') expect(s[i].end).toBeLessThanOrEqual(s[i - 1].start)
        }
        // The first suggestion is exactly where place() would put it alone.
        const alone = place([t], free, { now, existingPlacements: existing, anchor }).placements
        expect(s.slice(0, 1)).toEqual(alone)
      }
    }
  })

  it('capacity matches the free and needed minutes', () => {
    for (const seed of SEEDS) {
      const { free, tasks } = scenario(seed)
      const c = capacity(free, tasks, { now: 0 })
      expect(c.freeMin - c.neededMin).toBe(c.spareMin - c.shortfallMin)
      expect(c.fits).toBe(c.shortfallMin === 0)
      // If place() fit everything, capacity must agree there was room.
      const res = place(tasks.filter((t, i) => t.durationMin > 0 && tasks.findIndex((x) => x.id === t.id) === i), free, { now: 0, alignMin: 1 })
      if (res.unplaced.length === 0) expect(c.fits).toBe(true)
    }
  })

  it('refit never schedules into the past', () => {
    for (const seed of SEEDS) {
      const { free, existing, now, anchor } = scenario(seed)
      const blocks = existing.map((e) => ({ ...e, taskId: `m-${e.taskId}` }))
      const r = refit(blocks, free, { now, anchor })
      const upcoming = blocks.filter((b) => b.end > now)
      for (const p of r.placements) {
        expect(p.start).toBeGreaterThanOrEqual(now)
        for (const u of upcoming) expect(overlaps(p, u)).toBe(false)
      }
      expect(r.placements.length + r.unplaced.length + r.notMissed.length).toBe(blocks.length)
    }
  })
})
