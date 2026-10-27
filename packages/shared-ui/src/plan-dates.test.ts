import { describe, it, expect } from 'vitest'
import { dayLabel, daysFromToday, doByLabel, dueEnd, formatDuration, isAllDay, localDayKey, stillToDoLabel, dayAndTime, dayMonthAndTime } from './plan-dates'

// Monday 26 Oct 2026, midday local time. Built from local parts so the tests
// hold in any time zone.
const now = new Date(2026, 9, 26, 12, 0)
const at = (day: number, hour = 9, minute = 0) => new Date(2026, 9, day, hour, minute)

describe('daysFromToday', () => {
  it('counts local calendar days, not 24-hour spans', () => {
    expect(daysFromToday(at(26, 23, 59), now)).toBe(0)
    expect(daysFromToday(at(27, 0, 1), now)).toBe(1)
    expect(daysFromToday(at(25, 23, 59), now)).toBe(-1)
  })

  it('accepts ISO strings', () => {
    expect(daysFromToday(at(29).toISOString(), now)).toBe(3)
  })
})

describe('dayLabel', () => {
  it('names today, tomorrow and yesterday', () => {
    expect(dayLabel(at(26), now)).toBe('Today')
    expect(dayLabel(at(27), now)).toBe('Tomorrow')
    expect(dayLabel(at(25), now)).toBe('Yesterday')
  })

  it('uses a short date otherwise', () => {
    expect(dayLabel(at(29), now)).toBe('Thu 29 Oct')
  })
})

describe('doByLabel', () => {
  it('says when a to-do should be done, in sentence case', () => {
    expect(doByLabel(at(26), now)).toBe('Do by today')
    expect(doByLabel(at(27), now)).toBe('Do by tomorrow')
    expect(doByLabel(at(30), now)).toBe('Do by Fri 30 Oct')
    // A day already gone reads calmly, never "Do by yesterday" or "overdue".
    expect(doByLabel(at(25), now)).toBe('Still to do from yesterday')
    expect(doByLabel(at(22), now)).toBe('Still to do from Thursday')
  })
})

describe('dayAndTime', () => {
  it('joins the day with a 24-hour clock time', () => {
    expect(dayAndTime(at(27, 14, 5), now)).toBe('Tomorrow 14:05')
  })
})

describe('stillToDoLabel', () => {
  it('reads calmly, never "overdue"', () => {
    expect(stillToDoLabel(at(26, 8), now)).toBe('Still to do from earlier today')
    expect(stillToDoLabel(at(25), now)).toBe('Still to do from yesterday')
    expect(stillToDoLabel(at(21), now)).toBe('Still to do from Wednesday')
    expect(stillToDoLabel(at(12), now)).toBe('Still to do from 12 Oct')
  })
})

describe('localDayKey', () => {
  it('groups by local day', () => {
    expect(localDayKey(at(29, 0, 30))).toBe('2026-10-29')
    expect(localDayKey(at(29, 23, 30))).toBe('2026-10-29')
  })
})

describe('formatDuration', () => {
  it('formats minutes compactly', () => {
    expect(formatDuration(20)).toBe('20m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(90)).toBe('1h 30m')
  })
})

describe('all-day due dates', () => {
  it('treats exactly local midnight as all day on that date', () => {
    expect(isAllDay(at(30, 0))).toBe(true)
    expect(isAllDay(new Date(2026, 9, 30, 0, 0, 1))).toBe(false)
    expect(isAllDay(at(30, 17))).toBe(false)
  })

  it('passes at the end of an all-day date, or at a real due time', () => {
    expect(dueEnd(at(30, 0))).toBe(at(31, 0).getTime())
    expect(dueEnd(at(30, 17).toISOString())).toBe(at(30, 17).getTime())
  })
})

describe('dayMonthAndTime', () => {
  it('reads "27 Oct, 00:20" with a 24-hour clock', () => {
    expect(dayMonthAndTime(at(27, 0, 20))).toBe('27 Oct, 00:20')
    expect(dayMonthAndTime(at(5, 14, 5))).toBe('5 Oct, 14:05')
  })
})
