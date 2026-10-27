import { describe, expect, it } from 'vitest'
import { expandPlanItems, validatePlanItem } from '../packages/substrate/src/plan-items'
import {
  capacityCopy, completeTrims, defaultTrims, draftPlan, planCapacity, planTasks, rankForPlan, studyDays, weekLayout,
} from '../packages/substrate/src/planning'
import type { PlanItem } from '../packages/substrate/src/types'
import { priyaWeek, seededReviews, SEED_MISSED_IDS, SEED_TIME_ZONE } from './seed-week'

const at = (iso: string) => Date.parse(iso)

function stored(now: number, items = priyaWeek(now)): PlanItem[] {
  return items.map((item) => ({
    starts_at: null, ends_at: null, due_at: null, duration_min: null, status: 'open', recurrence: null,
    subtype: null, source_type: null, source_id: null, source_offset_ms: null, course: null,
    created_at: '', updated_at: '',
    ...item,
  }))
}

/** London wall time, e.g. "Mon 10:00", of an ISO instant. */
function london(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SEED_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso)).replace(',', '')
}

function week(now: number, from: string, to: string) {
  const rows = expandPlanItems(stored(now), { from, to })
  return {
    fixed: rows.filter((r) => r.kind === 'commitment').map((r) => `${london(r.starts_at!)}-${london(r.ends_at!).slice(4)} ${r.title}`),
    due: rows.filter((r) => r.kind === 'deadline').map((r) => `${r.due_at} ${r.title}`),
  }
}

describe("Priya's seeded week", () => {
  it('on a Wednesday: lectures and two shifts this week, quiz Thursday, lab report Friday', () => {
    // Wed 28 Oct 2026, just after the clocks went back (25 Oct).
    const w = week(at('2026-10-28T12:00:00Z'), '2026-10-26T00:00:00Z', '2026-11-02T00:00:00Z')
    expect(w.fixed).toEqual([
      'Mon 10:00-12:00 Biology lecture',
      'Tue 14:00-16:00 Chemistry lecture',
      'Tue 17:00-22:00 Cafe shift',
      'Wed 10:00-12:00 Biology lecture',
      'Thu 17:00-22:00 Cafe shift',
    ])
    expect(w.due).toEqual([
      '2026-10-29T10:00:00.000Z Biology quiz',
      '2026-10-30T17:00:00.000Z Chemistry lab report',
    ])
  })

  it('keeps London wall-clock times across a DST change since the series began', () => {
    // Wed 31 Mar 2027: BST since 28 Mar, the series started four weeks earlier in GMT.
    const now = at('2027-03-31T12:00:00Z')
    const series = priyaWeek(now).filter((i) => i.recurrence)
    expect(series.every((i) => Date.parse(i.starts_at!) < at('2027-03-28T00:00:00Z'))).toBe(true)
    const w = week(now, '2027-03-28T23:00:00Z', '2027-04-04T23:00:00Z')
    expect(w.fixed[0]).toBe('Mon 10:00-12:00 Biology lecture')
    expect(w.due).toEqual([
      '2027-04-01T09:00:00.000Z Biology quiz',
      '2027-04-02T16:00:00.000Z Chemistry lab report',
    ])
  })

  it.each([
    // now (UTC; London is GMT here), quiz due, lab report due
    ['Mon morning', '2026-10-26T08:00:00Z', '2026-10-29T10:00', '2026-10-30T17:00'],
    ['Thu 09:59', '2026-10-29T09:59:00Z', '2026-10-29T10:00', '2026-10-30T17:00'],
    ['Thu 10:00, the quiz just started', '2026-10-29T10:00:00Z', '2026-11-05T10:00', '2026-10-30T17:00'],
    ['Fri morning', '2026-10-30T08:00:00Z', '2026-11-05T10:00', '2026-10-30T17:00'],
    ['Fri 17:30', '2026-10-30T17:30:00Z', '2026-11-05T10:00', '2026-11-06T17:00'],
    ['Sun 23:30', '2026-11-01T23:30:00Z', '2026-11-05T10:00', '2026-11-06T17:00'],
  ])('on %s every deadline, and the to-do due with it, is still ahead', (_when, nowIso, quizDue, labDue) => {
    const now = at(nowIso)
    const items = priyaWeek(now)
    const due = (id: string) => items.find((i) => i.id === id)!.due_at!.slice(0, 16)
    expect(due('seed-bio-quiz')).toBe(quizDue)
    expect(due('seed-todo-quiz-revision')).toBe(quizDue)
    expect(due('seed-chem-lab-report')).toBe(labDue)
    expect(due('seed-todo-lab-write-up')).toBe(labDue)
    for (const item of items) if (item.due_at) expect(Date.parse(item.due_at)).toBeGreaterThan(now)
  })

  it('has valid items, fixed unique ids, and 12 hours of unscheduled to-dos with estimates and courses', () => {
    const items = [...priyaWeek(at('2026-10-28T12:00:00Z')), ...seededReviews()]
    for (const item of items) expect(validatePlanItem(item), item.id).toBeNull()
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    const todos = items.filter((i) => i.kind === 'task' && i.starts_at == null)
    expect(todos.length).toBeGreaterThanOrEqual(3)
    expect(todos.every((t) => t.duration_min! > 0 && t.course)).toBe(true)
    expect(todos.reduce((sum, t) => sum + t.duration_min!, 0)).toBe(12 * 60)
    // Shifts are part of no course.
    expect(items.filter((i) => i.subtype === 'shift').every((i) => i.course == null)).toBe(true)
  })

  it.each([
    ['Mon morning', '2026-10-26T08:00:00Z'],
    ['Sat 10:00, the reading just started', '2026-10-31T10:00:00Z'],
    ['Sun 23:30', '2026-11-01T23:30:00Z'],
  ])('on %s the planned study blocks are still ahead, so none is a missed block', (_when, nowIso) => {
    const now = at(nowIso)
    const missed = new Set<string>(SEED_MISSED_IDS)
    for (const item of priyaWeek(now).filter((i) => i.kind === 'task' && i.starts_at && !missed.has(i.id))) {
      expect(Date.parse(item.starts_at!), item.id).toBeGreaterThan(now)
    }
  })

  it.each([
    ['Tue 10:30', '2026-10-27T10:30:00Z', ['Mon 08:30-09:30', 'Mon 12:30-13:30']],
    ['Mon 08:00, after a weekend', '2026-10-26T08:00:00Z', ['Sun 08:30-09:30', 'Sun 12:30-13:30']],
  ])('on %s two open study blocks from yesterday did not happen', (_when, nowIso, slots) => {
    const now = at(nowIso)
    const missed = priyaWeek(now).filter((i) => (SEED_MISSED_IDS as readonly string[]).includes(i.id))
    expect(missed.map((m) => `${london(m.starts_at!)}-${london(m.ends_at!).slice(4)}`)).toEqual(slots)
    for (const m of missed) {
      expect(m).toMatchObject({ kind: 'task', duration_min: 60 })
      expect(m.status ?? 'open').toBe('open')
      expect(Date.parse(m.ends_at!)).toBeLessThan(now)
    }
  })

  it('reviews for the seeded confusing moments are done and in April, as the automation shapes them', () => {
    for (const review of seededReviews()) {
      expect(review).toMatchObject({ kind: 'task', subtype: 'review', status: 'done', duration_min: 20, source_type: 'recording' })
      expect(review.title).toMatch(/^Review: /)
      expect(review.source_offset_ms).toBeGreaterThanOrEqual(0)
      expect(Date.parse(review.ends_at!)).toBeLessThan(at('2026-05-01T00:00:00Z'))
    }
  })
})

/**
 * Demo step 2 (plans/student-planning-demo.md) on the demo day, through the
 * same planning code Help me plan and the mock Auto-fill run: Tue 27 Oct
 * 2026 10:30 London (GMT), the default 2h of study time a day.
 */
describe('Help me plan on Tuesday 10:30 of the demo week', () => {
  const now = at('2026-10-27T10:30:00Z')
  const week = { start: at('2026-10-26T00:00:00Z'), end: at('2026-11-02T00:00:00Z') }
  const items = stored(now, [...priyaWeek(now), ...seededReviews()])
  const rows = expandPlanItems(items, { from: new Date(week.start).toISOString(), to: new Date(week.end).toISOString() })
  const layout = weekLayout(rows, week, { timeZone: SEED_TIME_ZONE })
  const todos = items.filter((i) => i.kind === 'task' && i.status === 'open' && i.starts_at == null)
  const tasks = planTasks(todos, week, { now })
  const cap = planCapacity(layout, tasks, now)

  it('reads "About 9 hours of study time left this week. Your to-dos need 12."', () => {
    expect(studyDays(layout, now).map((d) => d.leftMin)).toEqual([0, 120, 120, 120, 120, 0, 60])
    expect(capacityCopy(cap)).toBe('About 9 hours of study time left this week. Your to-dos need 12.')
    expect(cap.fits).toBe(false)
  })

  it('Auto-fill trims only the lab report write-up, to 2h', () => {
    const trims = completeTrims(defaultTrims(tasks, cap.shortfallMin, 120), tasks, { overCapacity: !cap.fits, minutesPerDay: 120 })
    expect(trims.map((t) => [t.taskId, t.durationMin])).toEqual([['seed-todo-lab-write-up', 120]])
  })

  it('drafts the quiz revision first and leaves the rest honestly unplaced', () => {
    const order = rankForPlan(tasks)
    expect(order[0]).toBe('seed-todo-quiz-revision')
    const ordered = order.map((id) => tasks.find((t) => t.id === id)!)
    const draft = draftPlan(ordered, layout, { now })
    const placed = draft.placements.reduce((sum, p) => sum + (p.end - p.start) / 60_000, 0)
    expect(placed).toBeLessThanOrEqual(cap.freeMin)
    expect(draft.unplaced.map((u) => [u.taskId, u.reason])).toContainEqual(['seed-todo-lab-write-up', 'over-daily-budget'])
  })
})
