import { describe, it, expect } from 'vitest'
import { todayLine, todayRange } from './today-line'

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
    expect(line).toEqual({ weekday: 'Tuesday', events: ['Chemistry 14:00', 'shift 17:00-22:00'], studyLeftMin: 120 })
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

describe('todayRange', () => {
  it('spans the local day, 23 hours on the day the clocks go forward', () => {
    const r = todayRange(Date.parse('2026-03-29T12:00:00.000Z'))
    expect(new Date(r.start).toISOString()).toBe('2026-03-29T00:00:00.000Z')
    expect((r.end - r.start) / 3_600_000).toBe(23)
  })
})
