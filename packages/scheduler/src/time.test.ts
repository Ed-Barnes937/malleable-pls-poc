import { describe, expect, it } from 'vitest'
import { offsetMs, parseTimeOfDay, startOfLocalDay, wallClock, zonedTimeToUtc } from './time'

const at = (iso: string) => Date.parse(iso)
const HOUR = 3_600_000

describe('wallClock', () => {
  it('reads local wall time in the given zone', () => {
    expect(wallClock(at('2026-07-01T23:30:15Z'), 'Europe/London')).toEqual({
      year: 2026,
      month: 7,
      day: 2,
      hour: 0,
      minute: 30,
      second: 15,
    })
  })

  it('throws on an unknown time zone', () => {
    expect(() => wallClock(0, 'Not/AZone')).toThrow(RangeError)
  })
})

describe('offsetMs', () => {
  it('reflects DST and sub-second instants', () => {
    expect(offsetMs(at('2026-01-15T12:00:00.250Z'), 'Europe/London')).toBe(0)
    expect(offsetMs(at('2026-07-15T12:00:00Z'), 'Europe/London')).toBe(HOUR)
    expect(offsetMs(at('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-4 * HOUR)
    expect(offsetMs(at('2026-07-15T12:00:00Z'), 'Asia/Kathmandu')).toBe(5.75 * HOUR)
  })
})

describe('zonedTimeToUtc', () => {
  it('converts local times in winter and summer', () => {
    expect(zonedTimeToUtc(2026, 1, 15, 8 * 60, 'Europe/London')).toBe(at('2026-01-15T08:00:00Z'))
    expect(zonedTimeToUtc(2026, 7, 15, 8 * 60, 'Europe/London')).toBe(at('2026-07-15T07:00:00Z'))
    expect(zonedTimeToUtc(2026, 7, 15, 8 * 60, 'America/New_York')).toBe(
      at('2026-07-15T12:00:00Z'),
    )
  })

  it('handles the days either side of the London DST transitions', () => {
    // Spring forward 2026-03-29 01:00 UTC, fall back 2026-10-25 01:00 UTC.
    expect(zonedTimeToUtc(2026, 3, 28, 8 * 60, 'Europe/London')).toBe(at('2026-03-28T08:00:00Z'))
    expect(zonedTimeToUtc(2026, 3, 29, 8 * 60, 'Europe/London')).toBe(at('2026-03-29T07:00:00Z'))
    expect(zonedTimeToUtc(2026, 3, 29, 30, 'Europe/London')).toBe(at('2026-03-29T00:30:00Z'))
    expect(zonedTimeToUtc(2026, 10, 24, 8 * 60, 'Europe/London')).toBe(at('2026-10-24T07:00:00Z'))
    expect(zonedTimeToUtc(2026, 10, 25, 8 * 60, 'Europe/London')).toBe(at('2026-10-25T08:00:00Z'))
  })

  it('moves a non-existent time later by the gap and picks the earlier of an ambiguous time, east or west of UTC', () => {
    // 01:30 does not exist on 2026-03-29 in London: lands on 02:30 BST.
    expect(zonedTimeToUtc(2026, 3, 29, 90, 'Europe/London')).toBe(at('2026-03-29T01:30:00Z'))
    // 01:30 happens twice on 2026-10-25: the first (BST) reading wins.
    expect(zonedTimeToUtc(2026, 10, 25, 90, 'Europe/London')).toBe(at('2026-10-25T00:30:00Z'))
    // New York: 02:30 on 2026-03-08 does not exist, lands on 03:30 EDT.
    expect(zonedTimeToUtc(2026, 3, 8, 150, 'America/New_York')).toBe(at('2026-03-08T07:30:00Z'))
    // 01:30 on 2026-11-01 happens twice: the first (EDT) reading wins.
    expect(zonedTimeToUtc(2026, 11, 1, 90, 'America/New_York')).toBe(at('2026-11-01T05:30:00Z'))
    // Just after each change, ordinary times are exact.
    expect(zonedTimeToUtc(2026, 3, 8, 180, 'America/New_York')).toBe(at('2026-03-08T07:00:00Z'))
    expect(zonedTimeToUtc(2026, 11, 1, 120, 'America/New_York')).toBe(at('2026-11-01T07:00:00Z'))
  })

  it('round-trips every hour of a year in several zones', () => {
    for (const tz of ['Europe/London', 'America/New_York', 'Australia/Sydney', 'Asia/Kathmandu']) {
      for (let t = at('2026-01-01T00:00:00Z'); t < at('2027-01-01T00:00:00Z'); t += HOUR) {
        const w = wallClock(t, tz)
        const back = zonedTimeToUtc(w.year, w.month, w.day, w.hour * 60 + w.minute, tz)
        // Ambiguous readings resolve to the earlier instant, so `back` is t or an hour before it.
        expect(back === t || back === t - HOUR).toBe(true)
        expect(wallClock(back, tz)).toEqual(w)
      }
    }
  })

  it('rolls over overflowing days and minutes', () => {
    expect(zonedTimeToUtc(2026, 1, 32, 0, 'UTC')).toBe(at('2026-02-01T00:00:00Z'))
    expect(zonedTimeToUtc(2026, 1, 0, 1440, 'UTC')).toBe(at('2026-01-01T00:00:00Z'))
  })
})

describe('startOfLocalDay', () => {
  it('returns local midnight, optionally shifted by days', () => {
    const now = at('2026-07-01T23:30:00Z') // 00:30 on 2 July in London
    expect(startOfLocalDay(now, 'Europe/London')).toBe(at('2026-07-01T23:00:00Z'))
    expect(startOfLocalDay(now, 'Europe/London', 2)).toBe(at('2026-07-03T23:00:00Z'))
    expect(startOfLocalDay(now, 'UTC', -1)).toBe(at('2026-06-30T00:00:00Z'))
  })

  it('is DST-aware across a transition', () => {
    const sat = at('2026-10-24T12:00:00Z')
    expect(startOfLocalDay(sat, 'Europe/London', 1)).toBe(at('2026-10-24T23:00:00Z'))
    expect(startOfLocalDay(sat, 'Europe/London', 2)).toBe(at('2026-10-26T00:00:00Z'))
  })
})

describe('parseTimeOfDay', () => {
  it('parses HH:MM from 00:00 to 24:00', () => {
    expect(parseTimeOfDay('00:00')).toBe(0)
    expect(parseTimeOfDay('08:30')).toBe(510)
    expect(parseTimeOfDay('24:00')).toBe(1440)
  })

  it.each(['8:00', '24:01', '25:00', '12:60', 'ab:cd', '', '12:00:00'])('rejects %j', (v) => {
    expect(() => parseTimeOfDay(v)).toThrow(RangeError)
  })
})
