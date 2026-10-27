import { describe, it, expect } from 'vitest'
import {
  addDays, atMinutes, formatDuration, formatRangeTitle, formatSpan, fromInputs,
  snap, snapDown, startOfWeek, toDateInput, toTimeInput, wallMinutes,
} from './time'

describe('week arithmetic', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek(new Date(2026, 9, 26, 15))).toEqual(new Date(2026, 9, 26)) // Monday
    expect(startOfWeek(new Date(2026, 10, 1, 23))).toEqual(new Date(2026, 9, 26)) // Sunday
    expect(startOfWeek(new Date(2026, 9, 27))).toEqual(new Date(2026, 9, 26))
  })

  it('adds calendar days, not 24h blocks', () => {
    // Europe/London leaves BST on Sun 25 Oct 2026; local midnights stay midnights.
    const d = addDays(new Date(2026, 9, 24), 2)
    expect([d.getDate(), d.getHours()]).toEqual([26, 0])
  })

  it('maps wall-clock minutes both ways', () => {
    const d = atMinutes(new Date(2026, 9, 27), 9 * 60 + 30)
    expect(wallMinutes(d)).toBe(570)
    expect(toTimeInput(d)).toBe('09:30')
  })
})

describe('snapping', () => {
  it('rounds to the nearest and floors to the step', () => {
    expect(snap(52)).toBe(45)
    expect(snap(53)).toBe(60)
    expect(snapDown(59)).toBe(45)
    expect(snapDown(59, 30)).toBe(30)
  })
})

describe('formatting', () => {
  it('formats spans, durations and titles', () => {
    expect(formatSpan(new Date(2026, 9, 27, 9, 5), new Date(2026, 9, 27, 17, 0))).toBe('09:05 - 17:00')
    expect(formatDuration(20)).toBe('20 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(90)).toBe('1 h 30')
    expect(formatRangeTitle(new Date(2026, 9, 26), new Date(2026, 10, 1))).toBe('26 Oct - 1 Nov 2026')
    expect(formatRangeTitle(new Date(2026, 10, 2), new Date(2026, 10, 8))).toBe('2 - 8 Nov 2026')
    expect(formatRangeTitle(new Date(2026, 11, 28), new Date(2027, 0, 3))).toBe('28 Dec 2026 - 3 Jan 2027')
    expect(formatRangeTitle(new Date(2026, 9, 27), new Date(2026, 9, 27))).toBe('Tue 27 Oct 2026')
  })

  it('round-trips form inputs', () => {
    const d = new Date(2026, 9, 27, 14, 45)
    expect(fromInputs(toDateInput(d), toTimeInput(d))).toEqual(d)
    expect(fromInputs('', '10:00')).toBeNull()
    expect(fromInputs('2026-10-27', '')).toBeNull()
  })
})
