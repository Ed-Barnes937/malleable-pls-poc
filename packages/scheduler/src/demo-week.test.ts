/**
 * The demo scenarios from plans/student-planning-demo.md, end to end through
 * the public API, the way T7, T9 and T10 are expected to call it.
 */
import { describe, expect, it } from 'vitest'
import { capacity, freeSlots, place, refit, startOfLocalDay, suggestSlots, wallClock } from './index'

const TZ = 'Europe/London'
const at = (iso: string) => Date.parse(iso)
// Week of Mon 26 Oct 2026 (London is on GMT after the 25 Oct change).
const week = { start: at('2026-10-26T00:00:00Z'), end: at('2026-11-02T00:00:00Z') }
const prefs = { timeZone: TZ, bufferMin: 10 }

const priyasWeek = [
  // Biology and Chemistry lectures.
  { start: at('2026-10-26T10:00:00Z'), end: at('2026-10-26T12:00:00Z') },
  { start: at('2026-10-28T10:00:00Z'), end: at('2026-10-28T12:00:00Z') },
  { start: at('2026-10-27T14:00:00Z'), end: at('2026-10-27T16:00:00Z') },
  // Cafe shifts, including Thursday evening.
  { start: at('2026-10-27T17:00:00Z'), end: at('2026-10-27T22:00:00Z') },
  { start: at('2026-10-29T17:00:00Z'), end: at('2026-10-29T22:00:00Z') },
]

describe('demo week', () => {
  it('T7: a confused moment becomes a 20-min review within 3 days, around commitments and accepted blocks', () => {
    const now = at('2026-10-28T17:42:00Z') // Wednesday evening, just tagged "confused"
    const accepted = [{ taskId: 'lab-1', start: at('2026-10-28T18:00:00Z'), end: at('2026-10-28T19:00:00Z') }]
    const free = freeSlots(priyasWeek, { start: now, end: week.end }, prefs)
    const review = { id: 'review', durationMin: 20, latest: now + 3 * 24 * 3_600_000 }

    const { placements } = place([review], free, { now, existingPlacements: accepted })
    // 17:45-18:05 would clip the accepted 18:00 block, so it goes straight after it.
    expect(placements).toEqual([{ taskId: 'review', start: at('2026-10-28T19:00:00Z'), end: at('2026-10-28T19:20:00Z') }])
    const [p] = placements
    expect(wallClock(p.start, TZ)).toMatchObject({ day: 28, hour: 19, minute: 0 })

    // Automation edited to "30 min by tomorrow": the old block is passed back and the task moves.
    const byTomorrow = startOfLocalDay(now, TZ, 2)
    const moved = place([{ id: 'review', durationMin: 30, latest: byTomorrow }], free, {
      now,
      existingPlacements: [...accepted, ...placements],
    }).placements
    expect(moved).toEqual([{ taskId: 'review', start: p.start, end: p.start + 30 * 60_000 }])
  })

  it('T9: honest capacity note, suggestions, and auto-fill in AI priority order', () => {
    const now = at('2026-10-29T08:00:00Z') // Thursday morning, planning the rest of today
    const free = freeSlots(priyasWeek, { start: now, end: at('2026-10-30T00:00:00Z') }, {
      ...prefs,
      dayEnd: '18:00',
    })
    const todos = [
      { id: 'lab-write-up', durationMin: 8 * 60, latest: at('2026-10-30T17:00:00Z') },
      { id: 'quiz-prep', durationMin: 2 * 60, latest: at('2026-10-29T17:00:00Z') },
      { id: 'flashcards', durationMin: 2 * 60 },
    ]
    const c = capacity(free, todos)
    expect(c.neededMin).toBe(12 * 60)
    expect(c.fits).toBe(false)
    // "About 9 free hours. This needs 12."
    expect(Math.round(c.freeMin / 60)).toBe(9)
    expect(c.shortfallMin).toBe(12 * 60 - c.freeMin)

    // AI ranked quiz prep first; the lab write-up does not fit, and says so.
    const ranked = [todos[1], todos[0], todos[2]]
    const r = place(ranked, free, { now })
    expect(r.placements.map((x) => x.taskId)).toEqual(['quiz-prep', 'flashcards'])
    expect(r.unplaced).toEqual([{ taskId: 'lab-write-up', reason: 'no-free-slot' }])

    const s = suggestSlots(todos[2], free, 3, { now, existingPlacements: r.placements })
    expect(s.length).toBeGreaterThan(0)
  })

  it('T10: missed blocks are re-fit into free time after now', () => {
    const now = at('2026-10-30T09:00:00Z')
    const free = freeSlots(priyasWeek, { start: now, end: week.end }, prefs)
    const r = refit(
      [
        { taskId: 'a', start: at('2026-10-27T08:00:00Z'), end: at('2026-10-27T09:00:00Z') },
        { taskId: 'b', start: at('2026-10-28T08:00:00Z'), end: at('2026-10-28T08:30:00Z') },
      ],
      free,
      { now },
    )
    expect(r.placements).toEqual([
      { taskId: 'a', start: at('2026-10-30T09:00:00Z'), end: at('2026-10-30T10:00:00Z') },
      { taskId: 'b', start: at('2026-10-30T10:00:00Z'), end: at('2026-10-30T10:30:00Z') },
    ])
  })
})
