import { describe, it, expect } from 'vitest'
import { DEFAULT_PREFERENCES } from '@pls/substrate'
import { upNextLabel, upNextRange, upNextSummary, upNextZone, weekEnd } from './up-next'

// Tests run in Europe/London (vitest.config.ts). Tue 27 Oct 2026 is GMT.
const TZ = 'Europe/London'
const at = (time: string, day = '2026-10-27') => `${day}T${time}:00.000Z`
const NOW = Date.parse(at('09:00'))

let n = 0
function row(fields: Record<string, unknown>) {
  return {
    id: `r${n++}`, kind: 'task', status: 'open', subtype: null, title: 'Thing', course: null,
    starts_at: null, ends_at: null, due_at: null, duration_min: null, source_type: null, source_id: null,
    ...fields,
  } as Parameters<typeof upNextSummary>[0][number]
}

const chemistry = row({ kind: 'commitment', title: 'Chemistry lecture', subtype: 'class', course: 'chemistry', starts_at: at('14:00'), ends_at: at('16:00') })
const shift = row({ kind: 'commitment', title: 'Cafe shift', subtype: 'shift', starts_at: at('17:00'), ends_at: at('22:00') })
const summary = (rows: Parameters<typeof upNextSummary>[0], tasks: Parameters<typeof upNextSummary>[1] = [], now = NOW) =>
  upNextSummary(rows, tasks, { now, timeZone: TZ })

describe('upNextSummary', () => {
  it('names the next item, classes by course and other items by title, with their times', () => {
    const s = summary([shift, chemistry])
    expect(s.next).toMatchObject({ name: 'Chemistry', type: 'class', time: '14:00', span: '14:00-16:00', live: false })
    expect(s.days).toHaveLength(1)
    expect(s.days[0].label).toBe('Today')
    expect(s.days[0].items.map((i) => `${i.name} ${i.time}`)).toEqual(['Chemistry 14:00', 'Cafe shift 17:00'])
  })

  it('counts study blocks as items, and leaves done, dismissed and over ones out', () => {
    const study = row({ title: 'Reading', starts_at: at('10:00'), ends_at: at('11:00') })
    const done = row({ title: 'Done', status: 'done', starts_at: at('09:30'), ends_at: at('09:45') })
    const dismissed = row({ ...chemistry, id: 'x', status: 'dismissed' })
    const over = row({ title: 'Earlier', starts_at: at('07:00'), ends_at: at('08:00') })
    const s = summary([over, done, dismissed, study])
    expect(s.days[0].items.map((i) => i.name)).toEqual(['Reading'])
    expect(s.days[0].items[0].type).toBe('study')
  })

  it('marks one that is going on as live, and keeps it until it ends', () => {
    expect(summary([chemistry, shift], [], Date.parse(at('15:00'))).next).toMatchObject({ name: 'Chemistry', live: true })
    expect(summary([chemistry, shift], [], Date.parse(at('16:00'))).next).toMatchObject({ name: 'Cafe shift', live: false })
    expect(summary([chemistry, shift], [], Date.parse(at('22:00'))).next).toBeNull()
  })

  it('lists five, grouped Today, Tomorrow and by weekday', () => {
    const rows = [
      chemistry,
      shift,
      row({ title: 'Biology', kind: 'commitment', subtype: 'class', course: 'biology', starts_at: at('10:00', '2026-10-28'), ends_at: at('12:00', '2026-10-28') }),
      row({ title: 'Lab', starts_at: at('10:00', '2026-10-29'), ends_at: at('11:00', '2026-10-29') }),
      row({ title: 'Quiz prep', starts_at: at('12:00', '2026-10-29'), ends_at: at('13:00', '2026-10-29') }),
      row({ title: 'Sixth', starts_at: at('12:00', '2026-10-30'), ends_at: at('13:00', '2026-10-30') }),
    ]
    const s = summary(rows)
    expect(s.days.map((d) => [d.label, d.items.length])).toEqual([['Today', 2], ['Tomorrow', 1], ['Thursday', 2]])
  })

  it('labels days a week or more away by date', () => {
    const later = row({ title: 'Lab', starts_at: at('10:00', '2026-11-03'), ends_at: at('11:00', '2026-11-03') })
    expect(summary([later]).days[0].label).toBe('Tue 3 Nov')
  })

  it('lists deadlines and dated to-dos due before the week ends, soonest first', () => {
    const quiz = row({ kind: 'deadline', title: 'Biology quiz', due_at: at('15:00', '2026-10-29') })
    const lab = row({ title: 'Lab report', due_at: at('17:00', '2026-10-30') })
    const nextWeek = row({ title: 'Essay', due_at: at('17:00', '2026-11-02') })
    const past = row({ title: 'Late', due_at: at('08:00') })
    const booked = row({ title: 'Booked', due_at: at('17:00', '2026-10-30'), starts_at: at('10:00', '2026-10-29'), ends_at: at('11:00', '2026-10-29') })
    const s = summary([lab, nextWeek, past, booked, quiz])
    expect(s.due.map((d) => `${d.title} ${d.when} ${d.type}`)).toEqual(['Biology quiz Thu 15:00 deadline', 'Lab report Fri 17:00 todo'])
  })

  it('sums study booked from now to the end of the week, counting the rest of a block under way', () => {
    const a = row({ title: 'A', starts_at: at('08:30'), ends_at: at('10:00') })
    const b = row({ title: 'B', starts_at: at('13:00', '2026-10-30'), ends_at: at('14:00', '2026-10-30') })
    const nextWeek = row({ title: 'C', starts_at: at('13:00', '2026-11-02'), ends_at: at('14:00', '2026-11-02') })
    expect(summary([a, b, nextWeek, chemistry]).studyBookedMin).toBe(60 + 60)
  })

  it('counts to-dos with time not booked yet, by what is left to book', () => {
    const todo = row({ id: 't1', title: 'Lab report', duration_min: 180 })
    const session = row({ id: 's1', title: 'Lab report', source_type: 'plan_item', source_id: 't1', starts_at: at('10:00', '2026-10-28'), ends_at: at('11:00', '2026-10-28'), duration_min: 60 })
    const unestimated = row({ id: 't2', title: 'Read' })
    const allBooked = row({ id: 't3', title: 'Booked', duration_min: 60 })
    const block = row({ id: 's3', title: 'Booked', source_type: 'plan_item', source_id: 't3', starts_at: at('10:00', '2026-10-29'), ends_at: at('11:00', '2026-10-29') })
    const doneTodo = row({ id: 't4', title: 'Done', status: 'done', duration_min: 60 })
    const s = summary([], [todo, session, unestimated, allBooked, block, doneTodo])
    // 2h left of the lab report, plus the assumed hour for the unestimated one.
    expect(s.unbooked).toEqual({ count: 2, minutes: 120 + 60 })
  })

  it('reads times in the student zone, not the browser', () => {
    // 09:00 London is 18:00 Tokyo: Chemistry 14:00 London is 23:00 there, still today.
    const s = upNextSummary([chemistry], [], { now: NOW, timeZone: 'Asia/Tokyo' })
    expect(s.next?.time).toBe('23:00')
    expect(s.days[0].label).toBe('Today')
    // And 15:00 London is already tomorrow (00:00) in Tokyo.
    const late = row({ title: 'Reading', starts_at: at('15:00'), ends_at: at('16:00') })
    expect(upNextSummary([late], [], { now: NOW, timeZone: 'Asia/Tokyo' }).days[0].label).toBe('Tomorrow')
  })
})

describe('weekEnd and upNextRange', () => {
  it('ends the week at the coming Monday 00:00 in the zone', () => {
    expect(new Date(weekEnd(NOW, TZ)).toISOString()).toBe('2026-11-02T00:00:00.000Z')
    // A Sunday is the last day of its week.
    expect(new Date(weekEnd(Date.parse('2026-11-01T10:00:00Z'), TZ)).toISOString()).toBe('2026-11-02T00:00:00.000Z')
    // A Monday starts a new one.
    expect(new Date(weekEnd(Date.parse('2026-11-02T10:00:00Z'), TZ)).toISOString()).toBe('2026-11-09T00:00:00.000Z')
  })

  it('crosses the clocks changing: the week of Sunday 29 March 2026 (BST starts) ends at Monday 00:00 BST', () => {
    expect(new Date(weekEnd(Date.parse('2026-03-25T10:00:00Z'), TZ)).toISOString()).toBe('2026-03-29T23:00:00.000Z')
    expect(new Date(weekEnd(Date.parse('2026-10-21T10:00:00Z'), TZ)).toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })

  it('fetches from the start of today to a week past this week', () => {
    expect(upNextRange(NOW, TZ)).toEqual({ from: '2026-10-27T00:00:00.000Z', to: '2026-11-09T00:00:00.000Z' })
  })

  it('ends on a local midnight even when the clocks change in that week', () => {
    // The week of Wed 25 Mar 2026 ends Mon 30 Mar 00:00 BST; the next one ends Mon 6 Apr 00:00 BST.
    expect(upNextRange(Date.parse('2026-03-25T10:00:00Z'), TZ).to).toBe('2026-04-05T23:00:00.000Z')
    // The week of Wed 21 Oct 2026 ends Mon 26 Oct 00:00 GMT; the next ends Mon 2 Nov 00:00 GMT (clocks went back on the 25th).
    expect(upNextRange(Date.parse('2026-10-21T10:00:00Z'), TZ).to).toBe('2026-11-02T00:00:00.000Z')
  })
})

describe('upNextLabel', () => {
  const label = (item: Parameters<typeof upNextLabel>[0], now = NOW) => upNextLabel(item, now, TZ)
  const next = (rows: Parameters<typeof upNextSummary>[0], now = NOW) => summary(rows, [], now).next!

  it('says the time for today, "now" while live, and the day after today', () => {
    expect(label(next([shift]))).toBe('Cafe shift 17:00')
    expect(label(next([chemistry], Date.parse(at('15:00'))), Date.parse(at('15:00')))).toBe('Now: Chemistry')
    const tomorrow = row({ kind: 'commitment', title: 'Biology lecture', subtype: 'class', course: 'biology', starts_at: at('10:00', '2026-10-28'), ends_at: at('12:00', '2026-10-28') })
    expect(label(next([tomorrow]))).toBe('Biology tomorrow 10:00')
    const thursday = row({ title: 'Lab', starts_at: at('10:00', '2026-10-29'), ends_at: at('11:00', '2026-10-29') })
    expect(label(next([thursday]))).toBe('Lab Thu 10:00')
    // Next week a bare weekday would be ambiguous: say the date.
    const nextWeek = row({ title: 'Lab', starts_at: at('10:00', '2026-11-02'), ends_at: at('11:00', '2026-11-02') })
    expect(label(next([nextWeek]))).toBe('Lab Mon 2 Nov 10:00')
    expect(summary([nextWeek]).days[0].label).toBe('Mon 2 Nov')
  })
})

describe('upNextZone', () => {
  it("is the student's zone, else the browser's; null while preferences load", () => {
    expect(upNextZone({ ...DEFAULT_PREFERENCES, time_zone: 'America/New_York' }, false, TZ)).toBe('America/New_York')
    expect(upNextZone(DEFAULT_PREFERENCES, false, TZ)).toBe(TZ)
    expect(upNextZone(undefined, false, TZ)).toBeNull()
    expect(upNextZone(undefined, true, TZ)).toBe(TZ)
  })
})
