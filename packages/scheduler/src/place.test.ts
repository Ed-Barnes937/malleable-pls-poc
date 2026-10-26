import { describe, expect, it } from 'vitest'
import { freeSlots } from './free-slots'
import { place, refit, suggestSlots, type SchedulerTask } from './place'

const at = (iso: string) => Date.parse(iso)
const iv = (a: string, b: string) => ({ start: at(a), end: at(b) })
const block = (taskId: string, a: string, b: string) => ({ taskId, ...iv(a, b) })

// Mon 26 Oct 2026, UTC, default 08:00-22:00 study day.
const week = iv('2026-10-26T00:00:00Z', '2026-11-02T00:00:00Z')
const lectureMon = iv('2026-10-26T09:00:00Z', '2026-10-26T11:00:00Z')
const free = freeSlots([lectureMon], week)
const mondayMorning = at('2026-10-26T07:00:00Z')

describe('place', () => {
  it('puts a task in the earliest free gap long enough for it', () => {
    const r = place([{ id: 'a', durationMin: 90 }], free, { now: mondayMorning })
    expect(r).toEqual({ placements: [block('a', '2026-10-26T11:00:00Z', '2026-10-26T12:30:00Z')], unplaced: [] })
  })

  it('uses a gap before a commitment when it is long enough', () => {
    const r = place([{ id: 'a', durationMin: 45 }], free, { now: mondayMorning })
    expect(r.placements).toEqual([block('a', '2026-10-26T08:00:00Z', '2026-10-26T08:45:00Z')])
  })

  it('never starts before now and rounds starts up to the quarter hour', () => {
    const r = place([{ id: 'a', durationMin: 30 }], free, { now: at('2026-10-26T13:07:00Z') })
    expect(r.placements).toEqual([block('a', '2026-10-26T13:15:00Z', '2026-10-26T13:45:00Z')])
  })

  it('honours a custom alignMin', () => {
    const now = at('2026-10-26T13:07:00Z')
    expect(place([{ id: 'a', durationMin: 30 }], free, { now, alignMin: 1 }).placements[0].start).toBe(now)
    expect(place([{ id: 'a', durationMin: 30 }], free, { now, alignMin: 60 }).placements[0].start).toBe(
      at('2026-10-26T14:00:00Z'),
    )
  })

  it('respects earliest', () => {
    const task = { id: 'a', durationMin: 30, earliest: at('2026-10-28T18:00:00Z') }
    expect(place([task], free, { now: mondayMorning }).placements).toEqual([
      block('a', '2026-10-28T18:00:00Z', '2026-10-28T18:30:00Z'),
    ])
  })

  it('places tasks back to back without overlapping each other', () => {
    const tasks = [
      { id: 'a', durationMin: 45 },
      { id: 'b', durationMin: 45 },
      { id: 'c', durationMin: 45 },
    ]
    expect(place(tasks, free, { now: mondayMorning }).placements).toEqual([
      block('a', '2026-10-26T08:00:00Z', '2026-10-26T08:45:00Z'),
      block('b', '2026-10-26T11:00:00Z', '2026-10-26T11:45:00Z'),
      block('c', '2026-10-26T11:45:00Z', '2026-10-26T12:30:00Z'),
    ])
  })

  it('reports invalid durations', () => {
    const tasks = [0, -5, NaN, Infinity].map((d, i) => ({ id: `t${i}`, durationMin: d }))
    const r = place(tasks, free, { now: mondayMorning })
    expect(r.placements).toEqual([])
    expect(r.unplaced.map((u) => u.reason)).toEqual(Array(4).fill('invalid-duration'))
  })

  it('reports window-closed when the deadline has passed or the window is too short', () => {
    const now = at('2026-10-27T12:00:00Z')
    const tasks: SchedulerTask[] = [
      { id: 'past', durationMin: 30, latest: at('2026-10-27T11:00:00Z') },
      { id: 'tight', durationMin: 60, latest: at('2026-10-27T12:30:00Z') },
      { id: 'inverted', durationMin: 30, earliest: at('2026-10-29T00:00:00Z'), latest: at('2026-10-28T00:00:00Z') },
    ]
    expect(place(tasks, free, { now }).unplaced).toEqual([
      { taskId: 'past', reason: 'window-closed' },
      { taskId: 'tight', reason: 'window-closed' },
      { taskId: 'inverted', reason: 'window-closed' },
    ])
  })

  it('reports no-free-slot when the window is open but busy or fragmented', () => {
    // Window is 08:00-10:00 Monday, but only 08:00-09:00 is free.
    const busyMorning = { id: 'a', durationMin: 90, latest: at('2026-10-26T10:00:00Z') }
    // Longer than any study day.
    const huge = { id: 'b', durationMin: 15 * 60 }
    expect(place([busyMorning, huge], free, { now: mondayMorning }).unplaced).toEqual([
      { taskId: 'a', reason: 'no-free-slot' },
      { taskId: 'b', reason: 'no-free-slot' },
    ])
  })

  it('treats free time outside the supplied slots as unavailable', () => {
    const r = place([{ id: 'a', durationMin: 30 }], [], { now: mondayMorning })
    expect(r.unplaced).toEqual([{ taskId: 'a', reason: 'no-free-slot' }])
  })

  it('gives first pick to the caller priority order by default', () => {
    const tasks = [
      { id: 'later', durationMin: 60, latest: at('2026-10-30T00:00:00Z') },
      { id: 'urgent', durationMin: 60, latest: at('2026-10-26T13:00:00Z') },
    ]
    const r = place(tasks, free, { now: at('2026-10-26T11:00:00Z') })
    expect(r.placements).toEqual([block('later', '2026-10-26T11:00:00Z', '2026-10-26T12:00:00Z'), block('urgent', '2026-10-26T12:00:00Z', '2026-10-26T13:00:00Z')])
  })

  it('orders by deadline with policy "deadline", keeping caller order for ties', () => {
    const tasks = [
      { id: 'none', durationMin: 60 },
      { id: 'fri', durationMin: 60, latest: at('2026-10-30T00:00:00Z') },
      { id: 'mon', durationMin: 60, latest: at('2026-10-26T20:00:00Z') },
      { id: 'fri2', durationMin: 60, latest: at('2026-10-30T00:00:00Z') },
    ]
    const r = place(tasks, free, { now: at('2026-10-26T11:00:00Z'), policy: 'deadline' })
    expect(r.placements.map((p) => p.taskId)).toEqual(['mon', 'fri', 'fri2', 'none'])
    expect(r.placements[0].start).toBe(at('2026-10-26T11:00:00Z'))
  })

  it('never overlaps fixed existing placements', () => {
    const accepted = block('other', '2026-10-26T11:00:00Z', '2026-10-26T13:00:00Z')
    const untracked = iv('2026-10-26T13:00:00Z', '2026-10-26T13:30:00Z')
    const r = place([{ id: 'a', durationMin: 60 }], free, {
      now: at('2026-10-26T10:00:00Z'),
      existingPlacements: [accepted, untracked],
    })
    expect(r.placements).toEqual([block('a', '2026-10-26T13:30:00Z', '2026-10-26T14:30:00Z')])
  })

  it("frees a task's own existing block so it can move (re-place on param change)", () => {
    const now = at('2026-10-26T11:00:00Z')
    const first = place([{ id: 'review', durationMin: 20 }], free, { now })
    expect(first.placements[0].start).toBe(now)
    // Duration grows to 30 and the old 20-min block is passed back in.
    const second = place([{ id: 'review', durationMin: 30 }], free, {
      now,
      existingPlacements: first.placements,
    })
    expect(second.placements).toEqual([block('review', '2026-10-26T11:00:00Z', '2026-10-26T11:30:00Z')])
  })

  it('is idempotent when its own result is fed back in', () => {
    const tasks = [
      { id: 'a', durationMin: 50 },
      { id: 'b', durationMin: 120, latest: at('2026-10-28T00:00:00Z') },
      { id: 'c', durationMin: 25 },
    ]
    const opts = { now: mondayMorning, existingPlacements: [block('x', '2026-10-26T12:00:00Z', '2026-10-26T15:00:00Z')] }
    const first = place(tasks, free, opts)
    const again = place(tasks, free, { ...opts, existingPlacements: [...opts.existingPlacements, ...first.placements] })
    expect(again).toEqual(first)
  })

  it('does not mutate its inputs', () => {
    const tasks = [{ id: 'b', durationMin: 30, latest: 2 }, { id: 'a', durationMin: 30, latest: 1 }]
    const copy = structuredClone(tasks)
    const slots = structuredClone(free)
    place(tasks, slots, { now: 0, policy: 'deadline' })
    expect(tasks).toEqual(copy)
    expect(slots).toEqual(free)
  })

  describe('anchor "latest"', () => {
    it('puts a task as late as its window allows, on an aligned start', () => {
      const task = { id: 'a', durationMin: 20, latest: at('2026-10-28T17:42:00Z') }
      expect(place([task], free, { now: mondayMorning, anchor: 'latest' }).placements).toEqual([
        block('a', '2026-10-28T17:15:00Z', '2026-10-28T17:35:00Z'),
      ])
    })

    it('falls back to earlier gaps when the latest ones are too short or busy', () => {
      const task = { id: 'a', durationMin: 90, latest: at('2026-10-26T12:00:00Z') }
      const r = place([task], free, {
        now: mondayMorning,
        anchor: 'latest',
        existingPlacements: [iv('2026-10-26T11:00:00Z', '2026-10-26T11:15:00Z')],
      })
      // 11:15-12:00 is too short and 08:00-09:00 too; nothing fits.
      expect(r.unplaced).toEqual([{ taskId: 'a', reason: 'no-free-slot' }])
      const shorter = place([{ ...task, durationMin: 45 }], free, { now: mondayMorning, anchor: 'latest' })
      expect(shorter.placements).toEqual([block('a', '2026-10-26T11:15:00Z', '2026-10-26T12:00:00Z')])
    })

    it('respects earliest and now', () => {
      const task = { id: 'a', durationMin: 60, earliest: at('2026-10-26T11:30:00Z'), latest: at('2026-10-26T12:40:00Z') }
      expect(place([task], free, { now: mondayMorning, anchor: 'latest' }).placements).toEqual([
        block('a', '2026-10-26T11:30:00Z', '2026-10-26T12:30:00Z'),
      ])
      const tight = { ...task, earliest: at('2026-10-26T11:35:00Z') }
      expect(place([tight], free, { now: mondayMorning, anchor: 'latest' }).unplaced).toEqual([
        { taskId: 'a', reason: 'no-free-slot' },
      ])
    })

    it('uses the end of the supplied free time when a task has no deadline', () => {
      expect(place([{ id: 'a', durationMin: 60 }], free, { now: mondayMorning, anchor: 'latest' }).placements).toEqual([
        block('a', '2026-11-01T21:00:00Z', '2026-11-01T22:00:00Z'),
      ])
      // An unbounded free slot has no latest start.
      const open = [{ start: mondayMorning, end: Infinity }]
      expect(place([{ id: 'a', durationMin: 60 }], open, { now: mondayMorning, anchor: 'latest' }).unplaced).toEqual([
        { taskId: 'a', reason: 'no-free-slot' },
      ])
    })

    it('is idempotent when its own result is fed back in', () => {
      const tasks = [
        { id: 'a', durationMin: 50, latest: at('2026-10-29T00:00:00Z') },
        { id: 'b', durationMin: 120, latest: at('2026-10-28T00:00:00Z') },
      ]
      const first = place(tasks, free, { now: mondayMorning, anchor: 'latest' })
      expect(place(tasks, free, { now: mondayMorning, anchor: 'latest', existingPlacements: first.placements })).toEqual(first)
    })
  })

  it('reports later tasks that repeat an id as duplicate-id', () => {
    const r = place(
      [
        { id: 'x', durationMin: 30 },
        { id: 'y', durationMin: 30 },
        { id: 'x', durationMin: 60 },
      ],
      free,
      { now: mondayMorning },
    )
    expect(r.placements).toEqual([
      block('x', '2026-10-26T08:00:00Z', '2026-10-26T08:30:00Z'),
      block('y', '2026-10-26T08:30:00Z', '2026-10-26T09:00:00Z'),
    ])
    expect(r.unplaced).toEqual([{ taskId: 'x', reason: 'duplicate-id' }])
  })

  it.each([
    [{ now: NaN }],
    [{ now: 0, alignMin: 0 }],
    [{ now: 0, alignMin: -15 }],
    [{ now: 0, alignMin: Infinity }],
  ])('rejects invalid options %j', (opts) => {
    expect(() => place([], free, opts)).toThrow(RangeError)
  })
})

describe('suggestSlots', () => {
  const lectures = [
    lectureMon,
    iv('2026-10-26T13:00:00Z', '2026-10-26T14:00:00Z'),
    iv('2026-10-27T08:00:00Z', '2026-10-27T22:00:00Z'), // Tuesday fully booked
  ]
  const slots = freeSlots(lectures, week)

  it('offers the earliest fit in each separate gap, in time order', () => {
    const s = suggestSlots({ id: 't', durationMin: 60 }, slots, 3, { now: mondayMorning })
    expect(s).toEqual([
      block('t', '2026-10-26T08:00:00Z', '2026-10-26T09:00:00Z'),
      block('t', '2026-10-26T11:00:00Z', '2026-10-26T12:00:00Z'),
      block('t', '2026-10-26T14:00:00Z', '2026-10-26T15:00:00Z'),
    ])
  })

  it('skips gaps that are too short and stops at the deadline', () => {
    const s = suggestSlots(
      { id: 't', durationMin: 90, latest: at('2026-10-28T09:30:00Z') },
      slots,
      10,
      { now: mondayMorning },
    )
    expect(s).toEqual([
      block('t', '2026-10-26T11:00:00Z', '2026-10-26T12:30:00Z'),
      block('t', '2026-10-26T14:00:00Z', '2026-10-26T15:30:00Z'),
      block('t', '2026-10-28T08:00:00Z', '2026-10-28T09:30:00Z'),
    ])
  })

  it("avoids fixed existing blocks but ignores the task's own block", () => {
    const s = suggestSlots({ id: 't', durationMin: 60 }, slots, 2, {
      now: at('2026-10-26T10:00:00Z'),
      existingPlacements: [
        block('t', '2026-10-26T11:00:00Z', '2026-10-26T12:00:00Z'),
        block('other', '2026-10-26T14:00:00Z', '2026-10-26T22:00:00Z'),
      ],
    })
    expect(s.map((p) => p.start)).toEqual([at('2026-10-26T11:00:00Z'), at('2026-10-28T08:00:00Z')])
  })

  it('with anchor "latest", offers the latest fit per gap, latest first', () => {
    const s = suggestSlots({ id: 't', durationMin: 60, latest: at('2026-10-28T10:00:00Z') }, slots, 3, {
      now: mondayMorning,
      anchor: 'latest',
    })
    expect(s).toEqual([
      block('t', '2026-10-28T09:00:00Z', '2026-10-28T10:00:00Z'),
      block('t', '2026-10-26T21:00:00Z', '2026-10-26T22:00:00Z'),
      block('t', '2026-10-26T12:00:00Z', '2026-10-26T13:00:00Z'),
    ])
  })

  it('returns nothing for n <= 0 or an unplaceable task', () => {
    expect(suggestSlots({ id: 't', durationMin: 60 }, slots, 0, { now: mondayMorning })).toEqual([])
    expect(suggestSlots({ id: 't', durationMin: 0 }, slots, 3, { now: mondayMorning })).toEqual([])
    expect(
      suggestSlots({ id: 't', durationMin: 30, latest: mondayMorning }, slots, 3, { now: mondayMorning }),
    ).toEqual([])
  })

  it('validates options', () => {
    expect(() => suggestSlots({ id: 't', durationMin: 60 }, slots, 1, { now: NaN })).toThrow(RangeError)
  })
})

describe('refit', () => {
  const now = at('2026-10-28T12:05:00Z') // Wednesday
  const slots = freeSlots([], week)

  it('re-places only blocks that already ended, oldest first, from now', () => {
    const r = refit(
      [
        block('tue', '2026-10-27T18:00:00Z', '2026-10-27T18:30:00Z'),
        block('mon', '2026-10-26T18:00:00Z', '2026-10-26T19:00:00Z'),
        block('soon', '2026-10-28T12:00:00Z', '2026-10-28T13:00:00Z'), // still running
      ],
      slots,
      { now },
    )
    // 'soon' is in progress: it stays put and nothing is re-fit on top of it.
    expect(r.notMissed).toEqual(['soon'])
    expect(r.placements).toEqual([
      block('mon', '2026-10-28T13:00:00Z', '2026-10-28T14:00:00Z'),
      block('tue', '2026-10-28T14:00:00Z', '2026-10-28T14:30:00Z'),
    ])
    expect(r.unplaced).toEqual([])
  })

  it('treats upcoming blocks as busy, even ones sharing a task id with a missed block', () => {
    const r = refit(
      [
        block('a', '2026-10-28T09:00:00Z', '2026-10-28T10:00:00Z'),
        block('a', '2026-10-28T12:15:00Z', '2026-10-28T13:15:00Z'), // a second, upcoming block
        block('b', '2026-10-28T13:15:00Z', '2026-10-28T14:00:00Z'),
      ],
      slots,
      { now, existingPlacements: [block('x', '2026-10-28T14:00:00Z', '2026-10-28T14:30:00Z')] },
    )
    expect(r.notMissed).toEqual(['a', 'b'])
    expect(r.placements).toEqual([block('a', '2026-10-28T14:30:00Z', '2026-10-28T15:30:00Z')])
  })

  it('honours anchor "latest"', () => {
    const r = refit(
      [{ ...block('a', '2026-10-27T09:00:00Z', '2026-10-27T10:00:00Z'), latest: at('2026-10-29T12:00:00Z') }],
      slots,
      { now, anchor: 'latest' },
    )
    expect(r.placements).toEqual([block('a', '2026-10-29T11:00:00Z', '2026-10-29T12:00:00Z')])
  })

  it('uses durationMin when given and carries the deadline over', () => {
    const r = refit(
      [
        { ...block('short', '2026-10-27T10:00:00Z', '2026-10-27T11:00:00Z'), durationMin: 20 },
        { ...block('late', '2026-10-27T12:00:00Z', '2026-10-27T13:00:00Z'), latest: at('2026-10-28T12:30:00Z') },
      ],
      slots,
      { now },
    )
    expect(r.placements).toEqual([block('short', '2026-10-28T12:15:00Z', '2026-10-28T12:35:00Z')])
    expect(r.unplaced).toEqual([{ taskId: 'late', reason: 'window-closed' }])
  })

  it('treats a block ending exactly at now as missed', () => {
    const r = refit([block('a', '2026-10-28T11:00:00Z', '2026-10-28T12:05:00Z')], slots, { now })
    expect(r.notMissed).toEqual([])
    expect(r.placements).toHaveLength(1)
  })
})
