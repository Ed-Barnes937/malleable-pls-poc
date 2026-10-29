import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  DEFAULT_STUDY_HOURS,
  applyPreferencesUpdate,
  sameStudyHours,
  studyHoursSummary,
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

describe('applyPreferencesUpdate', () => {
  it('changes only what the patch names, and null puts the default back, as preferences.update saves it', () => {
    const set = applyPreferencesUpdate(DEFAULT_PREFERENCES, { study_hours: hours, time_zone: 'Europe/London' })
    expect(set).toEqual({ time_zone: 'Europe/London', study_hours: hours, study_min_per_day: 120 })
    expect(applyPreferencesUpdate(set, { study_min_per_day: 90 })).toEqual({ ...set, study_min_per_day: 90 })
    expect(applyPreferencesUpdate({ ...set, study_min_per_day: 90 }, { study_hours: null, study_min_per_day: null, time_zone: null }))
      .toEqual(DEFAULT_PREFERENCES)
  })
})

describe('studyHoursSummary', () => {
  const ten = { start: '10:00', end: '22:00' }
  const only = (open: Partial<StudyHours>): StudyHours => ({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null, ...open })

  it('says one range when every day is the same', () => {
    expect(studyHoursSummary(DEFAULT_STUDY_HOURS)).toBe('Study 09:00-22:00')
  })

  it('names the days off when a few are, and the days on when most are off', () => {
    expect(studyHoursSummary(only({ mon: ten, tue: ten, wed: ten, thu: ten, fri: ten, sat: ten }))).toBe('Study 10:00-22:00, no study Sun')
    expect(studyHoursSummary(only({ mon: ten, tue: ten, wed: ten, thu: ten, fri: ten }))).toBe('Study 10:00-22:00, no study Sat, Sun')
    expect(studyHoursSummary(only({ mon: ten, wed: ten }))).toBe('Study 10:00-22:00 on Mon, Wed')
  })

  it('says they vary when the days differ, and when no day has study', () => {
    expect(studyHoursSummary(hours)).toBe('Study hours vary by day')
    expect(studyHoursSummary(only({}))).toBe('No study on any day')
  })

  it('sameStudyHours compares day by day', () => {
    expect(sameStudyHours(DEFAULT_STUDY_HOURS, { ...DEFAULT_STUDY_HOURS })).toBe(true)
    expect(sameStudyHours(DEFAULT_STUDY_HOURS, hours)).toBe(false)
    expect(sameStudyHours(hours, { ...hours, sun: { start: '09:00', end: '22:00' } })).toBe(false)
  })
})
