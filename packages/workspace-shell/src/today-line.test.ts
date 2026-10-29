import { describe, it, expect } from 'vitest'
import { DEFAULT_STUDY_HOURS } from '@pls/substrate'
import { shortLineOptions, todayLine, todayStudyOptions } from './today-line'

// Tests run in Europe/London (vitest.config.ts). Tue 27 Oct 2026 is GMT.
const TZ = 'Europe/London'
const at = (time: string, day = '2026-10-27') => `${day}T${time}:00.000Z`
const NOW = Date.parse(at('09:00'))

let n = 0
function row(fields: Partial<Parameters<typeof todayLine>[0][number]>) {
  return {
    id: `r${n++}`, kind: 'commitment' as const, status: 'open' as const, subtype: null, title: 'Thing', course: null,
    starts_at: null, ends_at: null, ...fields,
  }
}

const chemistry = row({ title: 'Chemistry lecture', subtype: 'class', course: 'chemistry', starts_at: at('14:00'), ends_at: at('16:00') })
const shift = row({ title: 'Cafe shift', subtype: 'shift', starts_at: at('17:00'), ends_at: at('22:00') })

describe('todayLine', () => {
  it('names the weekday, each class by course and each shift by its hours, in time order', () => {
    const line = todayLine([shift, chemistry], { now: NOW, timeZone: TZ })
    expect(line).toEqual({
      weekday: 'Tuesday',
      events: ['Chemistry 14:00', 'shift 17:00-22:00'],
      studyLeftMin: 120,
      short: { weekday: 'Tue', upcoming: ['Chemistry 14:00', 'shift 17:00'] },
    })
  })

  it('leaves blocks that are over out, in both forms, and keeps one still going', () => {
    const at16 = todayLine([shift, chemistry], { now: Date.parse(at('16:00')), timeZone: TZ })
    expect(at16?.events).toEqual(['shift 17:00-22:00'])
    expect(at16?.short.upcoming).toEqual(['shift 17:00'])
    const at2159 = todayLine([shift, chemistry], { now: Date.parse(at('21:59')), timeZone: TZ })
    expect(at2159?.events).toEqual(['shift 17:00-22:00'])
    expect(at2159?.short.upcoming).toEqual(['shift 17:00'])
    const at22 = todayLine([shift, chemistry], { now: Date.parse(at('22:00')), timeZone: TZ })
    expect(at22?.events).toEqual([])
    expect(at22?.short.upcoming).toEqual([])
  })

  it('at noon, no longer lists a lecture that ended (the rehearsal: "Biology 10:00" at 12:00)', () => {
    const biology = row({ title: 'Biology lecture', subtype: 'class', course: 'biology', starts_at: at('10:00', '2026-10-28'), ends_at: at('12:00', '2026-10-28') })
    const line = todayLine([biology], { now: Date.parse(at('12:00', '2026-10-28')), timeZone: TZ })
    expect(line?.weekday).toBe('Wednesday')
    expect(line?.events).toEqual([])
    expect(line?.studyLeftMin).toBe(120)
  })

  it('counts study time left the way Help me plan does: capped by the day budget, less study already planned', () => {
    const study = row({ kind: 'task', title: 'Reading', starts_at: at('10:00'), ends_at: at('11:30') })
    expect(todayLine([chemistry, study], { now: NOW, timeZone: TZ })?.studyLeftMin).toBe(30)
    expect(todayLine([chemistry], { now: NOW, timeZone: TZ, studyMinPerDay: 180 })?.studyLeftMin).toBe(180)
  })

  it('has no study time left once the free time has passed', () => {
    expect(todayLine([chemistry, shift], { now: Date.parse(at('21:30')), timeZone: TZ })?.studyLeftMin).toBe(0)
  })

  it('uses the title for a class with no course and for other fixed blocks', () => {
    const tutorial = row({ title: 'Tutorial', subtype: 'class', starts_at: at('09:30'), ends_at: at('10:00') })
    const dentist = row({ title: 'Dentist', starts_at: at('12:00'), ends_at: at('12:30') })
    expect(todayLine([dentist, tutorial], { now: NOW, timeZone: TZ })?.events).toEqual(['Tutorial 09:30', 'Dentist 12:00'])
  })

  it('is null on a day with no class or shift', () => {
    const study = row({ kind: 'task', title: 'Reading', starts_at: at('10:00'), ends_at: at('11:00') })
    const deadline = row({ kind: 'deadline', title: 'Quiz' })
    const tomorrow = row({ ...chemistry, id: 'tomorrow', starts_at: at('14:00', '2026-10-28'), ends_at: at('16:00', '2026-10-28') })
    const dismissed = row({ ...chemistry, id: 'dismissed', status: 'dismissed' })
    expect(todayLine([], { now: NOW, timeZone: TZ })).toBeNull()
    expect(todayLine([study, deadline, tomorrow, dismissed], { now: NOW, timeZone: TZ })).toBeNull()
  })
})

describe('todayStudyOptions', () => {
  const prefs = { time_zone: null, study_hours: { ...DEFAULT_STUDY_HOURS, tue: null }, study_min_per_day: 90 }

  it("counts in the student's zone when they set one, else the browser's", () => {
    expect(todayStudyOptions(prefs, false, TZ)).toEqual({ timeZone: TZ, studyHours: prefs.study_hours, studyMinPerDay: 90 })
    expect(todayStudyOptions({ ...prefs, time_zone: 'America/New_York' }, false, TZ)?.timeZone).toBe('America/New_York')
  })

  it('waits for the preference, and uses the defaults if it fails to load', () => {
    expect(todayStudyOptions(undefined, false, TZ)).toBeNull()
    expect(todayStudyOptions(undefined, true, TZ)).toEqual({ timeZone: TZ, studyHours: DEFAULT_STUDY_HOURS, studyMinPerDay: 120 })
  })

  it("feeds todayLine: a no-study day has nothing left, and study time is today in the student's zone", () => {
    // Tuesday is "no study".
    expect(todayLine([chemistry], { now: NOW, ...todayStudyOptions(prefs, false, TZ)! })?.studyLeftMin).toBe(0)
    // At 09:00 London it is already 18:00 in Asia/Tokyo: what is left is Tokyo's
    // 18:00-22:00 (09:00-13:00 London), capped at 90 minutes, or nothing if that is busy.
    const tokyo = todayStudyOptions({ ...prefs, study_hours: DEFAULT_STUDY_HOURS, time_zone: 'Asia/Tokyo' }, false, TZ)!
    expect(todayLine([chemistry], { now: NOW, ...tokyo })?.studyLeftMin).toBe(90)
    const library = row({ title: 'Library shift', starts_at: at('08:00'), ends_at: at('13:00') })
    expect(todayLine([chemistry, library], { now: NOW, ...tokyo })?.studyLeftMin).toBe(0)
    // The same rows read in London have the afternoon free.
    expect(todayLine([chemistry, library], { now: NOW, timeZone: TZ })?.studyLeftMin).toBe(120)
  })
})

describe('todayLine in the study zone', () => {
  it('reads the weekday, the events and the study time all in that zone, never mixing two days', () => {
    // 20:00 Tuesday in London is 05:00 Wednesday in Tokyo.
    const now = Date.parse(at('20:00'))
    const biology = row({ title: 'Biology lecture', subtype: 'class', course: 'biology', starts_at: at('01:00', '2026-10-28'), ends_at: at('03:00', '2026-10-28') })
    const line = todayLine([chemistry, shift, biology], { now, timeZone: 'Asia/Tokyo' })
    expect(line).toEqual({
      weekday: 'Wednesday',
      // Tokyo's Wednesday: London's Tuesday shift runs 02:00-07:00 there (still going at 05:00),
      // the lecture 10:00-12:00. London's Tuesday chemistry was yesterday in Tokyo.
      events: ['shift 02:00-07:00', 'Biology 10:00'],
      // 09:00-22:00 Tokyo less the lecture, capped at 2h.
      studyLeftMin: 120,
      short: { weekday: 'Wed', upcoming: ['shift 02:00', 'Biology 10:00'] },
    })
    // The same moment in London is still Tuesday, with the shift going on.
    expect(todayLine([chemistry, shift, biology], { now, timeZone: TZ })).toMatchObject({
      weekday: 'Tuesday',
      events: ['shift 17:00-22:00'],
    })
  })

  it('gives shift hours in that zone', () => {
    expect(todayLine([shift], { now: NOW, timeZone: 'America/New_York' })?.events).toEqual(['shift 13:00-18:00'])
  })

  it('ends today at local midnight on the day the clocks go forward (a 23-hour day)', () => {
    // 23:30 on Sunday 29 March in London (BST): the class at 23:00 is today, the one at 00:30 Monday is not.
    const late = row({ title: 'Late class', subtype: 'class', starts_at: '2026-03-29T22:00:00.000Z', ends_at: '2026-03-29T22:45:00.000Z' })
    const monday = row({ title: 'Early class', subtype: 'class', starts_at: '2026-03-29T23:30:00.000Z', ends_at: '2026-03-30T00:30:00.000Z' })
    const line = todayLine([late, monday], { now: Date.parse('2026-03-29T21:00:00.000Z'), timeZone: TZ })
    expect(line?.weekday).toBe('Sunday')
    expect(line?.events).toEqual(['Late class 23:00'])
  })
})

describe('shortLineOptions', () => {
  it('drops the weekday, then the later blocks, keeping the study time to the end', () => {
    expect(shortLineOptions({ weekday: 'Tue', upcoming: ['Chemistry 14:00', 'shift 17:00'] }, '2h to study')).toEqual([
      ['Tue', 'Chemistry 14:00', 'shift 17:00', '2h to study'],
      ['Chemistry 14:00', 'shift 17:00', '2h to study'],
      ['Chemistry 14:00', '2h to study'],
      ['2h to study'],
    ])
  })

  it('without study time, ends on the next block', () => {
    expect(shortLineOptions({ weekday: 'Tue', upcoming: ['shift 17:00'] }, null)).toEqual([['Tue', 'shift 17:00'], ['shift 17:00']])
  })

  it('says only the study time once the blocks are over', () => {
    expect(shortLineOptions({ weekday: 'Tue', upcoming: [] }, '1h to study')).toEqual([['Tue', '1h to study'], ['1h to study']])
  })

  it('has nothing to say once the blocks are over and there is no study time left', () => {
    expect(shortLineOptions({ weekday: 'Tue', upcoming: [] }, null)).toEqual([])
  })
})

