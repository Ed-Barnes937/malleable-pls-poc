import { describe, expect, it } from 'vitest'
import {
  ASSUMED_ESTIMATE_MIN,
  capacityCopy,
  defaultTrims,
  draftPlan,
  formatMinutes,
  matchesWeakTopic,
  planAutofillInput,
  planCapacity,
  planTasks,
  rankForPlan,
  sanitizeAdvice,
  studyDays,
  suggestTaskSlots,
  weekLayout,
  type PlanTask,
} from './planning'
import type { PlanItem } from './types'

// Mon 2 Nov 2026; London is on GMT, so local = UTC that week.
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 10, 2 + day, h, m)
const iso = (day: number, h: number, m = 0) => new Date(at(day, h, m)).toISOString()
const week = { start: at(0, 0), end: at(7, 0) }
const tz = 'Europe/London'

function item(over: Partial<PlanItem> & Pick<PlanItem, 'id' | 'kind'>): PlanItem {
  return {
    title: over.id, starts_at: null, ends_at: null, due_at: null, duration_min: null, status: 'open',
    recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null, course: null,
    created_at: iso(0, 0), updated_at: iso(0, 0), ...over,
  }
}

function task(over: Partial<PlanTask> & Pick<PlanTask, 'id'>): PlanTask {
  return { title: over.id, course: null, dueAt: null, durationMin: 60, assumed: false, weakTopic: false, latest: week.end, ...over }
}

describe('weekLayout', () => {
  it('frees the study day around commitments (with buffer) and keeps study blocks busy', () => {
    const layout = weekLayout([
      item({ id: 'lecture', kind: 'commitment', starts_at: iso(0, 9), ends_at: iso(0, 11) }),
      item({ id: 'study', kind: 'task', starts_at: iso(0, 14), ends_at: iso(0, 15) }),
      item({ id: 'gone', kind: 'task', status: 'dismissed', starts_at: iso(0, 16), ends_at: iso(0, 17) }),
      item({ id: 'quiz', kind: 'deadline', due_at: iso(3, 9) }),
    ], week, { timeZone: tz })
    expect(layout.free[0]).toEqual({ start: at(0, 8), end: at(0, 8, 50) })
    expect(layout.free[1]).toEqual({ start: at(0, 11, 10), end: at(0, 22) })
    expect(layout.busy).toEqual([{ start: at(0, 14), end: at(0, 15), taskId: 'study' }])
    expect(layout.budget).toEqual({ minutesPerDay: 120, timeZone: tz })
  })

  it('leaves out rows being re-placed', () => {
    const layout = weekLayout([item({ id: 'a', kind: 'task', starts_at: iso(0, 9), ends_at: iso(0, 10) })], week, {
      timeZone: tz, except: new Set(['a']),
    })
    expect(layout.busy).toEqual([])
  })
})

describe('planTasks', () => {
  it('uses the estimate, else the given or assumed one, and the due time as the window when inside the week', () => {
    const [a, b, c, d] = planTasks([
      item({ id: 'a', kind: 'task', duration_min: 90, due_at: iso(4, 17) }),
      item({ id: 'b', kind: 'task' }),
      item({ id: 'c', kind: 'task', due_at: iso(9, 9) }),
      item({ id: 'd', kind: 'task', due_at: iso(-3, 9) }),
    ], week, { now: at(0, 8), estimates: { b: 30 } })
    expect(a).toMatchObject({ durationMin: 90, assumed: false, latest: at(4, 17) })
    expect(b).toMatchObject({ durationMin: 30, assumed: true })
    // Due after the week, or already past: plan it within this week.
    expect(c.latest).toBe(week.end)
    expect(d.latest).toBe(week.end)
    expect(planTasks([item({ id: 'e', kind: 'task' })], week, { now: 0 })[0].durationMin).toBe(ASSUMED_ESTIMATE_MIN)
  })
})

describe('matchesWeakTopic', () => {
  it('counts reviews, and titles sharing a meaningful word with a weak topic', () => {
    expect(matchesWeakTopic({ title: 'Anything', subtype: 'review' }, [])).toBe(true)
    expect(matchesWeakTopic({ title: 'Read about mitochondria', subtype: null }, ['Mitochondria have their own DNA'])).toBe(true)
    expect(matchesWeakTopic({ title: 'Problem sheet 3', subtype: null }, ['Mitochondria have their own DNA'])).toBe(false)
  })
})

describe('capacity and copy', () => {
  it('caps each day at the study budget', () => {
    const layout = weekLayout([], week, { timeZone: tz, studyMinPerDay: 90 })
    const cap = planCapacity(layout, [task({ id: 'a', durationMin: 720 })], at(0, 0))
    expect(cap).toMatchObject({ freeMin: 7 * 90, neededMin: 720, fits: false })
  })

  it('says it in hours, honestly', () => {
    expect(capacityCopy({ freeMin: 540, neededMin: 720 })).toBe('About 9 hours of study time left this week. Your to-dos need 12.')
    expect(capacityCopy({ freeMin: 60, neededMin: 45 }, 'next week')).toBe('About 1 hour of study time left next week. Your to-dos need 45 minutes.')
    expect(capacityCopy({ freeMin: 0, neededMin: 90 })).toBe('No study time left this week. Your to-dos need 1.5 hours.')
    expect(capacityCopy({ freeMin: 200, neededMin: 0 })).toBe('About 3.5 hours of study time left this week. Nothing left to plan.')
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(120)).toBe('2h')
  })

  it('studyDays reports free and budget-capped time per day', () => {
    const layout = weekLayout([item({ id: 's', kind: 'task', starts_at: iso(1, 9), ends_at: iso(1, 10, 30) })], week, { timeZone: tz })
    const days = studyDays(layout, at(0, 21))
    expect(days).toHaveLength(7)
    expect(days[0]).toEqual({ day: at(0, 0), freeMin: 60, leftMin: 60 })
    expect(days[1]).toMatchObject({ leftMin: 30 })
    expect(days[2]).toMatchObject({ freeMin: 14 * 60, leftMin: 120 })
  })
})

describe('draftPlan', () => {
  const layout = weekLayout([item({ id: 'accepted', kind: 'task', starts_at: iso(0, 8), ends_at: iso(0, 9) })], week, { timeZone: tz })

  it('places in the order given, within the budget and with a gap, around fixed and pinned blocks', () => {
    const r = draftPlan(
      [task({ id: 'b', durationMin: 60 }), task({ id: 'a', durationMin: 60 }), task({ id: 'long', durationMin: 180 })],
      layout,
      { now: at(0, 0), pinned: [{ taskId: 'p', start: at(1, 8), end: at(1, 10) }] },
    )
    expect(r.placements).toEqual([
      // Monday has 1h left after the accepted block; 10-minute gap -> 09:15.
      { taskId: 'b', start: at(0, 9, 15), end: at(0, 10, 15) },
      // Tuesday is spent by the pinned ghost.
      { taskId: 'a', start: at(2, 8), end: at(2, 9) },
    ])
    expect(r.unplaced).toEqual([{ taskId: 'long', reason: 'over-daily-budget' }])
  })

  it('suggests slots on days with budget left', () => {
    const s = suggestTaskSlots(task({ id: 'x', durationMin: 90 }), layout, { now: at(0, 0) })
    expect(s.map((p) => p.start)).toEqual([at(1, 8), at(2, 8), at(3, 8)])
  })
})

describe('ranking and trims', () => {
  const tasks = [
    task({ id: 'reading', durationMin: 180 }),
    task({ id: 'quiz', durationMin: 120, dueAt: iso(3, 9) }),
    task({ id: 'review', durationMin: 30, dueAt: iso(3, 9), weakTopic: true }),
    task({ id: 'lab', durationMin: 240, dueAt: iso(4, 17) }),
    task({ id: 'cards', durationMin: 30 }),
  ]

  it('ranks soonest due, then weak topics, then shorter first', () => {
    expect(rankForPlan(tasks)).toEqual(['review', 'quiz', 'lab', 'cards', 'reading'])
  })

  it('trims what is longer than a day, longest first, and shrinks towards a shortfall', () => {
    expect(defaultTrims(tasks, 0, 120).map((t) => [t.taskId, t.durationMin])).toEqual([['lab', 120], ['reading', 120]])
    // Shortfall only (budget not binding): the longest shrinks, not below half.
    expect(defaultTrims(tasks, 60, 600).map((t) => [t.taskId, t.durationMin])).toEqual([['lab', 180]])
    expect(defaultTrims(tasks, 0, 600)).toEqual([])
    expect(defaultTrims([task({ id: 'short', durationMin: 45 })], 60, 600)).toEqual([])
  })

  it('sanitizes advice: full order, valid trims only, tidy note', () => {
    const over = { freeMin: 300, neededMin: 600, shortfallMin: 300, spareMin: 0, fits: false }
    const advice = sanitizeAdvice({
      order: ['lab', 'ghost', 'lab', 'quiz'],
      trims: [
        { taskId: 'lab', durationMin: 118, reason: '  Draft   it first  ' },
        { taskId: 'lab', durationMin: 60, reason: 'again' },
        { taskId: 'unknown', durationMin: 30, reason: 'x' },
        { taskId: 'quiz', durationMin: 120, reason: 'not shorter' },
        { taskId: 'cards', durationMin: 5, reason: 'too short' },
        { taskId: 'reading', durationMin: 90, reason: 'ok' },
        { taskId: 'review', durationMin: 15, reason: 'over the cap of two' },
      ],
      note: `  ${'word '.repeat(80)} `,
    }, tasks, over, 600)
    expect(advice.order).toEqual(['lab', 'quiz', 'review', 'cards', 'reading'])
    expect(advice.trims).toEqual([
      { taskId: 'lab', durationMin: 120, reason: 'Draft it first' },
      { taskId: 'reading', durationMin: 90, reason: 'ok' },
    ])
    expect(advice.note!.length).toBeLessThanOrEqual(220)
    expect(advice.note!.endsWith('...')).toBe(true)

    // When everything fits, only to-dos longer than a day may be trimmed.
    const fits = { ...over, fits: true, shortfallMin: 0 }
    const relaxed = sanitizeAdvice({ order: [], trims: [{ taskId: 'lab', durationMin: 120, reason: '' }, { taskId: 'quiz', durationMin: 60, reason: '' }], note: '  ' }, tasks, fits, 120)
    expect(relaxed.trims.map((t) => t.taskId)).toEqual(['lab'])
    expect(relaxed.note).toBeNull()
  })
})

describe('planAutofillInput', () => {
  const base = { from: iso(0, 0), to: iso(7, 0), timeZone: tz, studyMinPerDay: 120 }
  it('accepts a week and rejects bad ranges and zones', () => {
    expect(planAutofillInput.parse({ ...base, estimates: { a: 60 } })).toMatchObject({ studyMinPerDay: 120 })
    expect(planAutofillInput.safeParse({ ...base, to: base.from }).success).toBe(false)
    expect(planAutofillInput.safeParse({ ...base, to: iso(14, 0) }).success).toBe(false)
    expect(planAutofillInput.safeParse({ ...base, timeZone: 'Mars/Olympus' }).success).toBe(false)
    expect(planAutofillInput.safeParse({ ...base, studyMinPerDay: 0 }).success).toBe(false)
  })
})
