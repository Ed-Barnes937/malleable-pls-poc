import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDY_HOURS,
  preferencesUpdateInput,
  studyDayWindows,
  studyHoursSchema,
  withDefaults,
  type StudyHours,
} from './preferences'

const hours: StudyHours = { ...DEFAULT_STUDY_HOURS, mon: { start: '10:00', end: '24:00' }, sun: null }

describe('withDefaults', () => {
  it('fills in 09:00-22:00 every day and 2h a day for anything not set', () => {
    expect(withDefaults(null)).toEqual({ time_zone: null, study_hours: DEFAULT_STUDY_HOURS, study_min_per_day: 120 })
    expect(DEFAULT_STUDY_HOURS.wed).toEqual({ start: '09:00', end: '22:00' })
    expect(withDefaults({ time_zone: 'Europe/Paris', study_hours: null, study_min_per_day: 90 }))
      .toEqual({ time_zone: 'Europe/Paris', study_hours: DEFAULT_STUDY_HOURS, study_min_per_day: 90 })
  })
})

describe('studyHoursSchema', () => {
  it('takes one HH:MM window or null per weekday, ending after it starts (24:00 only as an end)', () => {
    expect(studyHoursSchema.parse(hours)).toEqual(hours)
    expect(studyHoursSchema.safeParse({ ...hours, fri: { start: '00:00', end: '24:00' } }).success).toBe(true)
    for (const bad of [
      { ...hours, fri: { start: '20:00', end: '02:00' } },
      { ...hours, fri: { start: '10:00', end: '09:59' } },
      { ...hours, tue: { start: '9:00', end: '22:00' } },
      { ...hours, tue: { start: '24:00', end: '23:00' } },
      { ...hours, tue: { start: '09:00', end: '24:01' } },
      { ...hours, tue: { start: '09:00', end: '09:00' } },
      { ...hours, tue: { start: '09:00', end: '22:00', note: 'x' } },
      { ...hours, tue: undefined },
      { ...hours, holiday: null },
    ]) {
      expect(studyHoursSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('preferencesUpdateInput', () => {
  it('takes any subset, null to reset, and rejects unknown fields, zones and budgets out of range', () => {
    expect(preferencesUpdateInput.parse({})).toEqual({})
    expect(preferencesUpdateInput.parse({ study_hours: null, study_min_per_day: 90 })).toEqual({ study_hours: null, study_min_per_day: 90 })
    expect(preferencesUpdateInput.safeParse({ study_min_per_day: 10 }).success).toBe(false)
    expect(preferencesUpdateInput.safeParse({ study_min_per_day: 15 * 60 }).success).toBe(false)
    expect(preferencesUpdateInput.safeParse({ time_zone: 'Mars/Olympus' }).success).toBe(false)
    expect(preferencesUpdateInput.safeParse({ theme: 'dark' }).success).toBe(false)
  })
})

describe('studyDayWindows', () => {
  it("is the scheduler's per-weekday windows, Monday first", () => {
    const days = studyDayWindows(hours)
    expect(days).toHaveLength(7)
    expect(days[0]).toEqual({ dayStart: '10:00', dayEnd: '24:00' })
    expect(days[1]).toEqual({ dayStart: '09:00', dayEnd: '22:00' })
    expect(days[6]).toBeNull()
  })
})
