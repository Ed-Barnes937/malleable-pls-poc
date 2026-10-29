import { describe, expect, it } from 'vitest'
import { dayWindows, freeSlots } from './free-slots'

const at = (iso: string) => Date.parse(iso)
const iv = (a: string, b: string) => ({ start: at(a), end: at(b) })

describe('dayWindows', () => {
  it('defaults to 08:00-22:00 UTC for each day in range', () => {
    expect(dayWindows(iv('2026-10-26T00:00:00Z', '2026-10-28T00:00:00Z'))).toEqual([
      iv('2026-10-26T08:00:00Z', '2026-10-26T22:00:00Z'),
      iv('2026-10-27T08:00:00Z', '2026-10-27T22:00:00Z'),
    ])
  })

  it('clips to a range that starts and ends mid-window', () => {
    expect(dayWindows(iv('2026-10-26T13:07:00Z', '2026-10-27T09:00:00Z'))).toEqual([
      iv('2026-10-26T13:07:00Z', '2026-10-26T22:00:00Z'),
      iv('2026-10-27T08:00:00Z', '2026-10-27T09:00:00Z'),
    ])
  })

  it('returns nothing for an empty range', () => {
    const t = at('2026-10-26T10:00:00Z')
    expect(dayWindows({ start: t, end: t })).toEqual([])
  })

  it('keeps 08:00 local across the London spring-forward weekend', () => {
    const w = dayWindows(iv('2026-03-28T00:00:00Z', '2026-03-31T00:00:00Z'), {
      timeZone: 'Europe/London',
    })
    expect(w).toEqual([
      iv('2026-03-28T08:00:00Z', '2026-03-28T22:00:00Z'),
      iv('2026-03-29T07:00:00Z', '2026-03-29T21:00:00Z'),
      iv('2026-03-30T07:00:00Z', '2026-03-30T21:00:00Z'),
    ])
  })

  it('keeps 08:00 local across the New York fall-back weekend', () => {
    // US DST ends 2026-11-01.
    const w = dayWindows(iv('2026-10-31T00:00:00Z', '2026-11-03T00:00:00Z'), {
      timeZone: 'America/New_York',
      dayStart: '08:00',
      dayEnd: '09:00',
    })
    expect(w).toEqual([
      iv('2026-10-31T12:00:00Z', '2026-10-31T13:00:00Z'),
      iv('2026-11-01T13:00:00Z', '2026-11-01T14:00:00Z'),
      iv('2026-11-02T13:00:00Z', '2026-11-02T14:00:00Z'),
    ])
  })

  it('supports an overnight study day, including one that began before the range', () => {
    const w = dayWindows(iv('2026-10-27T00:00:00Z', '2026-10-28T00:00:00Z'), {
      dayStart: '20:00',
      dayEnd: '02:00',
    })
    expect(w).toEqual([
      iv('2026-10-27T00:00:00Z', '2026-10-27T02:00:00Z'),
      iv('2026-10-27T20:00:00Z', '2026-10-28T00:00:00Z'),
    ])
  })

  it('merges back-to-back whole days into one window', () => {
    const range = iv('2026-10-26T00:00:00Z', '2026-10-29T00:00:00Z')
    expect(dayWindows(range, { dayStart: '00:00', dayEnd: '24:00' })).toEqual([range])
    expect(dayWindows(range, { dayStart: '00:00', dayEnd: '00:00' })).toEqual([range])
  })

  it('rejects a non-finite range instead of looping forever', () => {
    const start = at('2026-10-26T00:00:00Z')
    expect(() => dayWindows({ start, end: Infinity })).toThrow(RangeError)
    expect(() => dayWindows({ start: NaN, end: start })).toThrow(RangeError)
  })

  it('rejects malformed times of day', () => {
    expect(() => dayWindows(iv('2026-10-26T00:00:00Z', '2026-10-27T00:00:00Z'), { dayStart: '8am' })).toThrow(
      RangeError,
    )
  })
})

describe('dayWindows with per-weekday windows', () => {
  const usual = { dayStart: '09:00', dayEnd: '22:00' }
  // Mon-Sat 09:00-22:00 except Wed 13:00-17:00 and Sat from 10:00; no study on Sunday.
  const days = [usual, usual, { dayStart: '13:00', dayEnd: '17:00' }, usual, usual, { dayStart: '10:00', dayEnd: '22:00' }, null]

  it("uses each local weekday's window, Monday first, and none on a null day", () => {
    // Mon 26 Oct to Mon 2 Nov 2026 (UTC).
    expect(dayWindows(iv('2026-10-26T00:00:00Z', '2026-11-02T00:00:00Z'), { days })).toEqual([
      iv('2026-10-26T09:00:00Z', '2026-10-26T22:00:00Z'),
      iv('2026-10-27T09:00:00Z', '2026-10-27T22:00:00Z'),
      iv('2026-10-28T13:00:00Z', '2026-10-28T17:00:00Z'),
      iv('2026-10-29T09:00:00Z', '2026-10-29T22:00:00Z'),
      iv('2026-10-30T09:00:00Z', '2026-10-30T22:00:00Z'),
      iv('2026-10-31T10:00:00Z', '2026-10-31T22:00:00Z'),
    ])
  })

  it('ignores dayStart/dayEnd when days is set', () => {
    const range = iv('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z') // a Sunday
    expect(dayWindows(range, { days, dayStart: '08:00', dayEnd: '22:00' })).toEqual([])
  })

  it('reads the weekday in the local time zone, not UTC', () => {
    // 23:30 UTC Saturday is already Sunday in Auckland: Sunday is null there.
    const range = iv('2026-10-31T00:00:00Z', '2026-11-01T11:00:00Z')
    const w = dayWindows(range, { days, timeZone: 'Pacific/Auckland' })
    // Only Saturday 31 Oct local (10:00-22:00 NZDT = Fri 21:00Z to Sat 09:00Z), clipped to the range.
    expect(w).toEqual([iv('2026-10-31T00:00:00Z', '2026-10-31T09:00:00Z')])
  })

  it('keeps each weekday at its local times across the London fall-back week', () => {
    // BST ends Sun 25 Oct 2026: Sat is UTC+1, Mon is UTC+0.
    const w = dayWindows(iv('2026-10-23T23:00:00Z', '2026-10-27T00:00:00Z'), { days, timeZone: 'Europe/London' })
    expect(w).toEqual([
      iv('2026-10-24T09:00:00Z', '2026-10-24T21:00:00Z'), // Sat 10:00-22:00 BST
      // Sun 25: no study.
      iv('2026-10-26T09:00:00Z', '2026-10-26T22:00:00Z'), // Mon 09:00-22:00 GMT
    ])
  })

  it('keeps each weekday at its local times across the London spring-forward week', () => {
    // BST starts Sun 29 Mar 2026.
    const spring = [...days.slice(0, 6), { dayStart: '12:00', dayEnd: '14:00' }]
    const w = dayWindows(iv('2026-03-28T00:00:00Z', '2026-03-31T00:00:00Z'), { days: spring, timeZone: 'Europe/London' })
    expect(w).toEqual([
      iv('2026-03-28T10:00:00Z', '2026-03-28T22:00:00Z'), // Sat GMT
      iv('2026-03-29T11:00:00Z', '2026-03-29T13:00:00Z'), // Sun 12:00-14:00 BST
      iv('2026-03-30T08:00:00Z', '2026-03-30T21:00:00Z'), // Mon 09:00-22:00 BST
    ])
  })

  it('rejects a per-weekday window that does not end after it starts (no overnight windows)', () => {
    const range = iv('2026-10-29T00:00:00Z', '2026-11-01T00:00:00Z')
    for (const fri of [{ dayStart: '20:00', dayEnd: '02:00' }, { dayStart: '10:00', dayEnd: '10:00' }]) {
      expect(() => dayWindows(range, { days: [null, null, null, null, fri, null, null] })).toThrow(RangeError)
    }
    // 24:00 is the end of the same day.
    expect(dayWindows(range, { days: [null, null, null, null, { dayStart: '20:00', dayEnd: '24:00' }, null, null] })).toEqual([
      iv('2026-10-30T20:00:00Z', '2026-10-31T00:00:00Z'),
    ])
  })

  it('returns nothing (and terminates) when every day is null', () => {
    expect(dayWindows(iv('2026-10-26T00:00:00Z', '2026-11-26T00:00:00Z'), { days: Array(7).fill(null) })).toEqual([])
  })

  it('rejects a days list that is not one entry per weekday', () => {
    expect(() => dayWindows(iv('2026-10-26T00:00:00Z', '2026-10-27T00:00:00Z'), { days: [usual] })).toThrow(RangeError)
    expect(() => dayWindows(iv('2026-10-26T00:00:00Z', '2026-10-27T00:00:00Z'), { days: [...days.slice(0, 6), { dayStart: '9', dayEnd: '22:00' }] })).toThrow(RangeError)
  })
})

describe('freeSlots', () => {
  const day = iv('2026-10-26T00:00:00Z', '2026-10-27T00:00:00Z')

  it('subtracts commitments from the study day', () => {
    const lecture = iv('2026-10-26T10:00:00Z', '2026-10-26T11:00:00Z')
    const shift = iv('2026-10-26T17:00:00Z', '2026-10-26T23:00:00Z')
    expect(freeSlots([shift, lecture], day)).toEqual([
      iv('2026-10-26T08:00:00Z', '2026-10-26T10:00:00Z'),
      iv('2026-10-26T11:00:00Z', '2026-10-26T17:00:00Z'),
    ])
  })

  it('pads commitments by bufferMin on both sides', () => {
    const lecture = iv('2026-10-26T10:00:00Z', '2026-10-26T11:00:00Z')
    expect(freeSlots([lecture], day, { bufferMin: 15 })).toEqual([
      iv('2026-10-26T08:00:00Z', '2026-10-26T09:45:00Z'),
      iv('2026-10-26T11:15:00Z', '2026-10-26T22:00:00Z'),
    ])
  })

  it('drops gaps shorter than minSlotMin (default 15)', () => {
    const a = iv('2026-10-26T08:10:00Z', '2026-10-26T12:00:00Z')
    const b = iv('2026-10-26T12:20:00Z', '2026-10-26T21:30:00Z')
    expect(freeSlots([a, b], day)).toEqual([
      iv('2026-10-26T12:00:00Z', '2026-10-26T12:20:00Z'),
      iv('2026-10-26T21:30:00Z', '2026-10-26T22:00:00Z'),
    ])
    expect(freeSlots([a, b], day, { minSlotMin: 30 })).toEqual([
      iv('2026-10-26T21:30:00Z', '2026-10-26T22:00:00Z'),
    ])
    expect(freeSlots([a, b], day, { minSlotMin: 0 })).toHaveLength(3)
  })

  it('ignores zero-length commitments even with a buffer', () => {
    const blip = iv('2026-10-26T10:00:00Z', '2026-10-26T10:00:00Z')
    expect(freeSlots([blip], day, { bufferMin: 30 })).toEqual([
      iv('2026-10-26T08:00:00Z', '2026-10-26T22:00:00Z'),
    ])
  })

  it('reads the day in the given time zone', () => {
    expect(freeSlots([], day, { timeZone: 'Europe/London' })).toEqual([
      iv('2026-10-26T08:00:00Z', '2026-10-26T22:00:00Z'),
    ])
    expect(freeSlots([], day, { timeZone: 'Europe/Berlin' })).toEqual([
      iv('2026-10-26T07:00:00Z', '2026-10-26T21:00:00Z'),
    ])
  })

  it.each([
    [{ bufferMin: -1 }],
    [{ bufferMin: Infinity }],
    [{ minSlotMin: NaN }],
  ])('rejects invalid prefs %j', (prefs) => {
    expect(() => freeSlots([], day, prefs)).toThrow(RangeError)
  })
})
