import { describe, expect, it } from 'vitest'
import {
  ASSUMED_ESTIMATE_MIN,
  capacityCopy,
  completeTrims,
  defaultTrims,
  draftCopy,
  autofillOrder,
  noteWithoutAmounts,
  openTime,
  outsideStudyHours,
  draftPlan,
  draftRest,
  withPendingBookings,
  trustedPendingBookings,
  formatMinutes,
  matchesWeakTopic,
  planAutofillInput,
  planCapacity,
  placeReviews,
  planRefit,
  planTasks,
  rankForPlan,
  sanitizeAdvice,
  leftoverStudyTime,
  noSlotCause,
  studyDays,
  suggestTaskSlots,
  weekLayout,
  type PlanTask,
} from './planning'
import type { PlanItem } from './types'
import { bookedMinutes, todosToPlan } from './sessions'
import { DEFAULT_STUDY_HOURS, type StudyHours } from './preferences'

// Mon 2 Nov 2026; London is on GMT, so local = UTC that week.
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 10, 2 + day, h, m)
const iso = (day: number, h: number, m = 0) => new Date(at(day, h, m)).toISOString()
const week = { start: at(0, 0), end: at(7, 0) }
const tz = 'Europe/London'

function item(over: Partial<PlanItem> & Pick<PlanItem, 'id' | 'kind'>): PlanItem {
  return {
    title: over.id, starts_at: null, ends_at: null, due_at: null, duration_min: null, status: 'open',
    recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null, created_by_workflow_id: null, course: null,
    created_at: iso(0, 0), updated_at: iso(0, 0), ...over,
  }
}

function task(over: Partial<PlanTask> & Pick<PlanTask, 'id'>): PlanTask {
  return { title: over.id, course: null, dueAt: null, durationMin: 60, assumed: false, weakTopic: false, latest: week.end, ...over }
}

// Mon 10:00-22:00 (late start), Wed 13:00-17:00, no study on Sunday; the rest default.
const studyHours: StudyHours = { ...DEFAULT_STUDY_HOURS, mon: { start: '10:00', end: '22:00' }, wed: { start: '13:00', end: '17:00' }, sun: null }

describe("study hours (the student's preference)", () => {
  it('bound free time per weekday, with none on a no-study day', () => {
    const layout = weekLayout([], week, { timeZone: tz, studyHours })
    expect(layout.free).toEqual([
      { start: at(0, 10), end: at(0, 22) },
      { start: at(1, 9), end: at(1, 22) },
      { start: at(2, 13), end: at(2, 17) },
      { start: at(3, 9), end: at(3, 22) },
      { start: at(4, 9), end: at(4, 22) },
      { start: at(5, 9), end: at(5, 22) },
    ])
    // Capacity counts only those days: 6 days x the 2h budget, nothing on Sunday.
    expect(planCapacity(layout, [task({ id: 'a', durationMin: 60 })], at(0, 0)).freeMin).toBe(6 * 120)
  })

  it('default to 09:00-22:00 every day', () => {
    expect(weekLayout([], week, { timeZone: tz }).free).toEqual(weekLayout([], week, { timeZone: tz, studyHours: DEFAULT_STUDY_HOURS }).free)
    expect(weekLayout([], week, { timeZone: tz }).free[6]).toEqual({ start: at(6, 9), end: at(6, 22) })
  })

  it('keep Auto-fill drafts inside them', () => {
    const layout = weekLayout([], week, { timeZone: tz, studyHours, studyMinPerDay: 60 })
    const { placements } = draftPlan([task({ id: 'a', durationMin: 60 }), task({ id: 'b', durationMin: 60 }), task({ id: 'c', durationMin: 60 })], layout, { now: at(0, 0) })
    expect(placements.map((p) => p.start)).toEqual([at(0, 10), at(1, 9), at(2, 13)])
  })

  it('keep reviews out of a no-study day and before a late start', () => {
    // Marked Saturday 21:00, due by Monday night: Sunday has no study hours, Monday starts at 10:00.
    const slots = placeReviews([], [{ id: 'r', durationMin: 20, markedAt: at(5, 21), latest: at(7, 23) }], { start: at(5, 0), end: at(8, 0) }, { now: at(5, 21), timeZone: tz, studyHours: { ...studyHours } })
    // Saturday's window ends at 22:00, an hour after the mark: too late. Next is Monday 10:00 (9 Nov).
    expect(slots.get('r')).toEqual({ start: at(7, 10), end: at(7, 10, 20) })
  })

  it('outsideStudyHours is the rest of the week: before, after, and all of a no-study day', () => {
    expect(outsideStudyHours(week, tz, studyHours)).toEqual([
      { start: at(0, 0), end: at(0, 10) },
      { start: at(0, 22), end: at(1, 9) },
      { start: at(1, 22), end: at(2, 13) },
      { start: at(2, 17), end: at(3, 9) },
      { start: at(3, 22), end: at(4, 9) },
      { start: at(4, 22), end: at(5, 9) },
      // Saturday night runs into a Sunday with no study at all.
      { start: at(5, 22), end: at(7, 0) },
    ])
    // A day that ends at 24:00 leaves nothing after it.
    const lateMonday = outsideStudyHours({ start: at(0, 0), end: at(1, 0) }, tz, { ...studyHours, mon: { start: '10:00', end: '24:00' } })
    expect(lateMonday).toEqual([{ start: at(0, 0), end: at(0, 10) }])
  })

  it("re-fit spends the student's own budget", () => {
    const missed = item({ id: 'm', kind: 'task', starts_at: iso(0, 9), ends_at: iso(0, 10), duration_min: 60 })
    const [p] = planRefit([missed], [], { now: at(0, 21, 30), timeZone: tz, studyHours, studyMinPerDay: 30 })
    // Monday has no 60m left before 22:00; Tuesday has no 60m of budget (30m): over budget, earliest free slot.
    expect(p.starts_at).toBe(iso(1, 9))
  })

  it('re-fit keeps a missed block at its length, not its to-do\'s estimate', () => {
    // A 2h to-do whose block was resized to 1h: re-fitting it books 1h again.
    const missed = item({ id: 'm', kind: 'task', starts_at: iso(0, 9), ends_at: iso(0, 10), duration_min: 120 })
    const [p] = planRefit([missed], [], { now: at(0, 21, 30), timeZone: tz, studyHours, studyMinPerDay: 120 })
    expect(Date.parse(p.ends_at!) - Date.parse(p.starts_at!)).toBe(60 * 60_000)
  })
})

describe('weekLayout', () => {
  it('frees the study day around commitments (with buffer) and keeps study blocks busy', () => {
    const layout = weekLayout([
      item({ id: 'lecture', kind: 'commitment', starts_at: iso(0, 10), ends_at: iso(0, 12) }),
      item({ id: 'study', kind: 'task', starts_at: iso(0, 14), ends_at: iso(0, 15) }),
      item({ id: 'gone', kind: 'task', status: 'dismissed', starts_at: iso(0, 16), ends_at: iso(0, 17) }),
      item({ id: 'quiz', kind: 'deadline', due_at: iso(3, 9) }),
    ], week, { timeZone: tz })
    // The study day starts at 09:00.
    expect(layout.free[0]).toEqual({ start: at(0, 9), end: at(0, 9, 50) })
    expect(layout.free[1]).toEqual({ start: at(0, 12, 10), end: at(0, 22) })
    expect(layout.busy).toEqual([{ start: at(0, 14), end: at(0, 15), taskId: 'study' }])
    expect(layout.budget).toEqual({ minutesPerDay: 120, timeZone: tz })
  })

  it('open time leaves out the past, study blocks and anything else busy (e.g. drafted blocks)', () => {
    const layout = weekLayout([item({ id: 'study', kind: 'task', starts_at: iso(1, 12), ends_at: iso(1, 13) })], week, { timeZone: tz })
    const open = openTime(layout, at(1, 11), [{ start: at(1, 14), end: at(1, 15) }])
    const tuesday = open.filter((i) => i.start >= at(1, 0) && i.end <= at(2, 0))
    expect(tuesday).toEqual([
      { start: at(1, 11), end: at(1, 12) },
      { start: at(1, 13), end: at(1, 14) },
      { start: at(1, 15), end: tuesday[2].end },
    ])
    expect(open.every((i) => i.start >= at(1, 11))).toBe(true)
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
    expect(capacityCopy({ freeMin: 200, neededMin: 0 })).toBe('About 3 hours of study time left this week. Nothing left to plan.')
    // Free rounds down and needed rounds up, so a 10-minute gap never reads as "fits".
    expect(capacityCopy({ freeMin: 530, neededMin: 540 })).toBe('About 8.5 hours of study time left this week. Your to-dos need 9.')
    // The daily cap Auto-fill drafts with, named in the headline.
    expect(capacityCopy({ freeMin: 540, neededMin: 720 }, 'this week', 120)).toBe('About 9 hours of study time left this week (2h a day). Your to-dos need 12.')
    expect(capacityCopy({ freeMin: 0, neededMin: 90 }, 'next week', 90)).toBe('No study time left next week (1h 30m a day). Your to-dos need 1.5 hours.')
    expect(draftCopy(360, 150)).toBe("Drafted 6h of study time. 2h 30m didn't fit.")
    expect(draftCopy(90, 0)).toBe('Drafted 1h 30m of study time. Everything fits.')
    expect(draftCopy(0, 240)).toBe("Nothing fits as it is. 4h didn't fit.")
    // Study time left unused is named for its real reason, so the numbers add up to the headline's.
    const gaps = (gapMin: number) => ({ gapMin, dayMin: 0 })
    const days = (dayMin: number) => ({ gapMin: 0, dayMin })
    expect(draftCopy(420, 300, gaps(120))).toBe("Drafted 7h of study time. 5h didn't fit. The other 2h of free time is in gaps too short for it.")
    // It agrees in number with the to-dos that didn't fit.
    expect(draftCopy(300, 240, gaps(120), 2)).toBe("Drafted 5h of study time. 4h didn't fit. The other 2h of free time is in gaps too short for them.")
    expect(draftCopy(0, 120, gaps(90))).toBe("Nothing fits as it is. 2h didn't fit. The 1h 30m of free time is in gaps too short for it.")
    // Held back by the 2h a day, not by short gaps: said so.
    expect(draftCopy(300, 240, days(60), 2)).toBe("Drafted 5h of study time. 4h didn't fit. The other 1h is on days with too little study time left for them.")
    expect(draftCopy(300, 120, days(60))).toBe("Drafted 5h of study time. 2h didn't fit. The other 1h is on days with too little study time left for it.")
    expect(draftCopy(0, 120, days(60))).toBe("Nothing fits as it is. 2h didn't fit. The 1h is on days with too little study time left for it.")
    expect(draftCopy(300, 240, { gapMin: 60, dayMin: 30 }, 2)).toBe(
      "Drafted 5h of study time. 4h didn't fit. The other 1h of free time is in gaps too short for them, and 30m is on days with too little study time left for them.",
    )
    // A part under 15 minutes goes unnamed.
    expect(draftCopy(300, 240, { gapMin: 60, dayMin: 10 }, 2)).toBe("Drafted 5h of study time. 4h didn't fit. The other 1h of free time is in gaps too short for them.")
    expect(draftCopy(420, 300, gaps(10))).toBe("Drafted 7h of study time. 5h didn't fit.")
    expect(draftCopy(420, 0, gaps(120))).toBe('Drafted 7h of study time. Everything fits.')
  })

  it('formats amounts of time', () => {
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
    expect(days[2]).toMatchObject({ freeMin: 13 * 60, leftMin: 120 })
  })
})

describe('draftPlan', () => {
  const layout = weekLayout([item({ id: 'accepted', kind: 'task', starts_at: iso(0, 9), ends_at: iso(0, 10) })], week, { timeZone: tz })

  it('places in the order given, within the budget and with a gap, around fixed and pinned blocks', () => {
    const r = draftPlan(
      [task({ id: 'b', durationMin: 60 }), task({ id: 'a', durationMin: 60 }), task({ id: 'long', durationMin: 180 })],
      layout,
      { now: at(0, 0), pinned: [{ taskId: 'p', start: at(1, 9), end: at(1, 11) }] },
    )
    expect(r.placements).toEqual([
      // Monday has 1h left after the accepted block; 10-minute gap -> 10:15.
      { taskId: 'b', start: at(0, 10, 15), end: at(0, 11, 15) },
      // Tuesday is spent by the pinned ghost.
      { taskId: 'a', start: at(2, 9), end: at(2, 10) },
      // Longer than a day: split into sessions, the hour Wednesday has left, then Thursday.
      { taskId: 'long', start: at(2, 10, 15), end: at(2, 11, 15) },
      { taskId: 'long', start: at(3, 9), end: at(3, 11) },
    ])
    expect(r.unplaced).toEqual([])
  })

  it('splits a to-do before its due time, never across a due time on the calendar', () => {
    // Wednesday 20:40: 20:45-22:00 is left tonight; the quiz is Thursday 10:00.
    const quizDue = iso(3, 10)
    const rows = [item({ id: 'quiz', kind: 'deadline', due_at: quizDue })]
    const l = weekLayout(rows, week, { timeZone: tz })
    const r = draftPlan(
      [task({ id: 'revise', durationMin: 120, dueAt: quizDue, latest: Date.parse(quizDue) })],
      l,
      { now: at(2, 20, 40) },
    )
    expect(r.placements).toEqual([
      { taskId: 'revise', start: at(2, 20, 45), end: at(2, 22) },
      { taskId: 'revise', start: at(3, 9), end: at(3, 9, 45) },
    ])
    // The due time itself is busy: a block may end on it but never start on it or run across it.
    const after = draftPlan([task({ id: 'x', durationMin: 60 })], l, { now: at(3, 9, 50) })
    expect(after.placements).toEqual([{ taskId: 'x', start: at(3, 10, 15), end: at(3, 11, 15) }])
  })

  it('orders dated to-dos first, soonest due first, then the advised order', () => {
    const list = [
      task({ id: 'undated-a' }),
      task({ id: 'fri', dueAt: iso(4, 17) }),
      task({ id: 'undated-b' }),
      task({ id: 'thu', dueAt: iso(3, 10) }),
    ]
    expect(autofillOrder(list, ['undated-b', 'fri', 'undated-a', 'thu']).map((t) => t.id))
      .toEqual(['thu', 'fri', 'undated-b', 'undated-a'])
  })

  it('suggests slots on days with budget left', () => {
    const s = suggestTaskSlots(task({ id: 'x', durationMin: 90 }), layout, { now: at(0, 0) })
    expect(s.map((p) => p.start)).toEqual([at(1, 9), at(2, 9), at(3, 9)])
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

  it('trims only towards a shortfall: the longest shrinks, not below half (a to-do longer than a day is split instead)', () => {
    expect(defaultTrims(tasks, 60).map((t) => [t.taskId, t.durationMin])).toEqual([['lab', 180]])
    expect(defaultTrims(tasks, 300).map((t) => [t.taskId, t.durationMin])).toEqual([['lab', 120]])
    expect(defaultTrims(tasks, 0)).toEqual([])
    expect(defaultTrims([task({ id: 'short', durationMin: 45 })], 60)).toEqual([])
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
    }, tasks, over)
    expect(advice.order).toEqual(['lab', 'quiz', 'review', 'cards', 'reading'])
    // Capacity trims: at most two.
    expect(advice.trims).toEqual([
      { taskId: 'lab', durationMin: 120, reason: 'Draft it first' },
      { taskId: 'reading', durationMin: 90, reason: 'ok' },
    ])
    expect(advice.note!.length).toBeLessThanOrEqual(220)
    expect(advice.note!.endsWith('...')).toBe(true)

    // When everything fits, nothing is trimmed (a to-do longer than a day is split).
    const fits = { ...over, fits: true, shortfallMin: 0 }
    const relaxed = sanitizeAdvice({ order: [], trims: [{ taskId: 'lab', durationMin: 120, reason: '' }, { taskId: 'quiz', durationMin: 60, reason: '' }], note: '  ' }, tasks, fits)
    expect(relaxed.trims).toEqual([])
    expect(relaxed.note).toBeNull()
    expect(completeTrims([], tasks, { overCapacity: true })).toEqual([])
  })

  it('drops sentences with amounts of time from the note (code says the numbers)', () => {
    expect(noteWithoutAmounts('Quiz prep goes first. About 4h 30m will not fit! Problem sheet 3 can wait.'))
      .toBe('Quiz prep goes first. Problem sheet 3 can wait.')
    const cap = { freeMin: 0, neededMin: 60, shortfallMin: 60, spareMin: 0, fits: false }
    expect(sanitizeAdvice({ order: [], trims: [], note: 'You need 3 hours more.' }, tasks, cap).note).toBeNull()
  })
})

describe('planAutofillInput', () => {
  const base = { from: iso(0, 0), to: iso(7, 0), timeZone: tz }
  it('accepts a week and rejects bad ranges and zones', () => {
    expect(planAutofillInput.parse({ ...base, estimates: { a: 60 } })).toMatchObject({ estimates: { a: 60 } })
    // The budget is the student's preference, read on the server: a client value is ignored.
    expect(planAutofillInput.parse({ ...base, studyMinPerDay: 600 })).not.toHaveProperty('studyMinPerDay')
    expect(planAutofillInput.safeParse({ ...base, to: base.from }).success).toBe(false)
    expect(planAutofillInput.safeParse({ ...base, to: iso(14, 0) }).success).toBe(false)
    expect(planAutofillInput.safeParse({ ...base, timeZone: 'Mars/Olympus' }).success).toBe(false)
  })

  it('takes the bookings still saving, with their times normalised to UTC', () => {
    const pending = [{ id: 'quiz', starts_at: '2026-11-02T09:00:00+00:00', ends_at: '2026-11-02T10:00:00Z' }]
    expect(planAutofillInput.parse({ ...base, pending }).pending).toEqual([{ id: 'quiz', starts_at: iso(0, 9), ends_at: iso(0, 10) }])
    expect(planAutofillInput.safeParse({ ...base, pending: [{ id: 'quiz', starts_at: 'soon', ends_at: iso(0, 10) }] }).success).toBe(false)
  })
})

describe('placeReviews', () => {
  const range = { start: at(0, 0), end: at(4, 0) }
  const review = (id: string, over: { markedAt?: number; latest?: number; durationMin?: number } = {}) =>
    ({ id, durationMin: 20, markedAt: at(0, 11), latest: at(3, 0), ...over })
  const shift = (day: number) => item({ id: `shift-${day}`, kind: 'commitment', starts_at: iso(day, 17), ends_at: iso(day, 22) })

  it('goes in the earliest free time in its window, an hour after the mark at the soonest', () => {
    const slots = placeReviews([], [review('r')], range, { now: at(0, 11), timeZone: tz })
    expect(slots.get('r')).toEqual({ start: at(0, 12), end: at(0, 12, 20) })
  })

  it('starts the day at 09:00', () => {
    const slots = placeReviews([], [review('r', { markedAt: at(0, 5) })], range, { now: at(0, 5), timeZone: tz })
    expect(slots.get('r')).toEqual({ start: at(0, 9), end: at(0, 9, 20) })
  })

  it('avoids shifts (with their buffer) and keeps a 10-minute gap from accepted blocks', () => {
    const slots = placeReviews([
      item({ id: 'lecture', kind: 'commitment', starts_at: iso(0, 12), ends_at: iso(0, 13) }),
      item({ id: 'accepted', kind: 'task', starts_at: iso(0, 13, 10), ends_at: iso(0, 14) }),
    ], [review('r')], range, { now: at(0, 11), timeZone: tz })
    // 12:00-13:10 is the lecture and its buffer, 13:10-14:00 the block; +10m gap.
    expect(slots.get('r')).toEqual({ start: at(0, 14, 15), end: at(0, 14, 35) })
  })

  it('skips a day already at its study budget', () => {
    const slots = placeReviews([
      item({ id: 'autofill', kind: 'task', starts_at: iso(0, 13), ends_at: iso(0, 15) }),
      shift(1),
    ], [review('r')], range, { now: at(0, 11), timeZone: tz })
    expect(slots.get('r')).toEqual({ start: at(1, 9), end: at(1, 9, 20) })
  })

  it('goes over the budget as a last resort, when every day in the window is at it', () => {
    const full = [0, 1, 2].map((d) => item({ id: `full-${d}`, kind: 'task', starts_at: iso(d, 15), ends_at: iso(d, 17) }))
    const slots = placeReviews(full, [review('r')], range, { now: at(0, 11), timeZone: tz })
    // Still an hour after the mark, in the earliest free slot.
    expect(slots.get('r')).toEqual({ start: at(0, 12), end: at(0, 12, 20) })
  })

  it('stays unscheduled only when the window has no free slot at all', () => {
    const away = [0, 1, 2].map((d) => item({ id: `away-${d}`, kind: 'commitment', starts_at: iso(d, 0), ends_at: iso(d + 1, 0) }))
    const slots = placeReviews(away, [review('r')], range, { now: at(0, 11), timeZone: tz })
    expect(slots.get('r')).toEqual({ reason: 'no-free-slot' })
  })

  it('places several in order, each clear of the last, and moves the ones being placed', () => {
    const slots = placeReviews([
      item({ id: 'a', kind: 'task', subtype: 'review', starts_at: iso(2, 19), ends_at: iso(2, 19, 20) }),
    ], [review('a'), review('b')], range, { now: at(0, 11), timeZone: tz })
    expect(slots.get('a')).toEqual({ start: at(0, 12), end: at(0, 12, 20) })
    expect(slots.get('b')).toEqual({ start: at(0, 12, 30), end: at(0, 12, 50) })
  })
})

describe('leftoverStudyTime', () => {
  // Monday and Tuesday (GMT), the default 2h of study a day.
  const monday = { start: at(0, 0), end: at(1, 0) }
  const twoDays = { start: at(0, 0), end: at(2, 0) }
  const now = monday.start
  const tz = { timeZone: 'Europe/London' }
  /** A class on `day` (0 = Monday) from `from` to `to`, in hours (10.5 is 10:30). */
  const commitment = (id: string, from: number, to: number, day = 0) => ({
    id, kind: 'commitment' as const, status: 'open' as const, subtype: null,
    starts_at: iso(day, Math.floor(from), (from % 1) * 60), ends_at: iso(day, Math.floor(to), (to % 1) * 60),
  })
  // Classes 10:30-12:00 and 13:30-22:00: two 70-minute gaps (10 minutes clear of each class).
  const shortGapsMonday = [commitment('a', 10.5, 12), commitment('b', 13.5, 22)]
  const stuck = (durationMin: number) => ({ durationMin, reason: 'no-free-slot' as const })

  it('blames short gaps when the day has budget to spare but no gap long enough', () => {
    expect(leftoverStudyTime(weekLayout(shortGapsMonday, monday, tz), now, [], [stuck(90)])).toEqual({ gapMin: 120, dayMin: 0 })
  })

  it("blames the day's study time, not gaps, when the 2h a day is what is left short (the Thursday rehearsal)", () => {
    // A 1h block drafted: 1h of the day's 2h is left, in one long free stretch; a 2h to-do can't use it.
    const drafted = [{ start: at(0, 9), end: at(0, 10) }]
    expect(leftoverStudyTime(weekLayout([], monday, tz), now, drafted, [stuck(120), stuck(120)])).toEqual({ gapMin: 0, dayMin: 60 })
  })

  it('a day short of both budget and gap length is blamed on the budget, the binding cause', () => {
    // A 1h block drafted at 09:00: 1h of budget left, and the gaps left are 20 and 70 minutes.
    const drafted = [{ start: at(0, 9), end: at(0, 10) }]
    expect(leftoverStudyTime(weekLayout(shortGapsMonday, monday, tz), now, drafted, [stuck(90)])).toEqual({ gapMin: 0, dayMin: 60 })
  })

  it('splits a week by day: one day short of gaps, another short of budget', () => {
    // Monday: 70-minute gaps, budget to spare. Tuesday: free all day, 1h 30m already drafted.
    const drafted = [{ start: at(1, 9), end: at(1, 10, 30) }]
    expect(leftoverStudyTime(weekLayout(shortGapsMonday, twoDays, tz), now, drafted, [stuck(90)])).toEqual({ gapMin: 120, dayMin: 30 })
  })

  it('blames neither when something else kept a to-do out (too long for a day, due too soon)', () => {
    const layout = weekLayout(shortGapsMonday, monday, tz)
    expect(leftoverStudyTime(layout, now, [], [stuck(90), { durationMin: 180, reason: 'over-daily-budget' }])).toEqual({ gapMin: 0, dayMin: 0 })
    expect(leftoverStudyTime(layout, now, [], [{ durationMin: 60, reason: 'window-closed' }])).toEqual({ gapMin: 0, dayMin: 0 })
    expect(leftoverStudyTime(layout, now, [], [])).toEqual({ gapMin: 0, dayMin: 0 })
  })

  it("names each to-do's own reason by the same rule (noSlotCause)", () => {
    const drafted = [{ start: at(0, 9), end: at(0, 10) }]
    // Short gaps, budget to spare.
    expect(noSlotCause(weekLayout(shortGapsMonday, monday, tz), now, [], 90)).toBe('gaps')
    // 1h of the 2h left in a long free day: a 2h to-do is short of study time.
    expect(noSlotCause(weekLayout([], monday, tz), now, drafted, 120)).toBe('budget')
    // Short of both on Monday: the budget binds.
    expect(noSlotCause(weekLayout(shortGapsMonday, monday, tz), now, drafted, 90)).toBe('budget')
    // A day used up to its 2h, with free time still ahead, is short of study time too.
    expect(noSlotCause(weekLayout([], monday, tz), now, [{ start: at(0, 9), end: at(0, 11) }], 60)).toBe('budget')
    // One day with the budget (Monday, short gaps) is enough to blame the gaps.
    expect(noSlotCause(weekLayout(shortGapsMonday, twoDays, tz), now, [{ start: at(1, 9), end: at(1, 10, 30) }], 90)).toBe('gaps')
  })

  it('leaves unnamed what neither explains: a day with a long enough gap and budget left', () => {
    // Free all day with the full 2h: a 90-minute to-do could go there, so nothing is blamed.
    expect(leftoverStudyTime(weekLayout([], monday, tz), now, [], [stuck(90)])).toEqual({ gapMin: 0, dayMin: 0 })
  })
})

describe('draftRest', () => {
  it('books a partly booked to-do rest before it is due, around its own block', () => {
    // A 2h quiz revision, due Thu 10:00, booked Wed 09:00-10:00 (resized from 2h): 1h left.
    const quiz = item({ id: 'quiz', kind: 'task', duration_min: 120, due_at: iso(3, 10), starts_at: iso(2, 9), ends_at: iso(2, 10) })
    const layout = weekLayout([quiz], week, { timeZone: tz, studyMinPerDay: 120 })
    const { placements, unplaced } = draftRest(quiz, 60, layout, at(2, 8))
    expect(unplaced).toEqual([])
    expect(placements).toHaveLength(1)
    const [rest] = placements
    expect(rest.end - rest.start).toBe(60 * 60_000)
    expect(rest.end).toBeLessThanOrEqual(at(3, 10))
    // Its own block stays where it is and is busy: the rest goes after it, with the usual gap.
    expect(rest.start).toBe(at(2, 10, 15))
    expect(suggestTaskSlots({ id: 'quiz', durationMin: 60, latest: at(3, 10) }, layout, { now: at(2, 8) })[0].start).toBe(at(2, 10, 15))
  })

  it('places nothing when the rest no longer fits before it is due', () => {
    const quiz = item({ id: 'quiz', kind: 'task', duration_min: 120, due_at: iso(2, 9, 30), starts_at: iso(1, 14), ends_at: iso(1, 15) })
    const layout = weekLayout([quiz], week, { timeZone: tz, studyMinPerDay: 120 })
    expect(draftRest(quiz, 60, layout, at(2, 9)).placements).toEqual([])
  })
})

describe('withPendingBookings', () => {
  it('counts a to-do given a time whose save has not landed as booked and busy, once', () => {
    const quiz = item({ id: 'quiz', kind: 'task', duration_min: 120 })
    const pending = [{ id: 'quiz', starts_at: iso(0, 9), ends_at: iso(0, 11) }]
    const rows = withPendingBookings([quiz], pending)
    expect(todosToPlan([quiz], bookedMinutes(rows))).toEqual([])
    expect(weekLayout(rows, week, { timeZone: tz }).busy).toEqual([{ start: at(0, 9), end: at(0, 11), taskId: 'pending:quiz@' + iso(0, 9) }])
    // The save landed first: nothing is added twice.
    const saved = { ...quiz, starts_at: iso(0, 9), ends_at: iso(0, 11) }
    expect(withPendingBookings([saved], pending)).toEqual([saved])
    expect(withPendingBookings([quiz])).toEqual([quiz])
  })
})

describe('trustedPendingBookings', () => {
  const opts = { week, todoIds: new Set(['quiz']) }
  const ok = { id: 'quiz', starts_at: iso(0, 9), ends_at: iso(0, 11) }

  it('keeps a real block in the week for one of the student\'s open to-dos', () => {
    expect(trustedPendingBookings([ok], opts)).toEqual([ok])
    expect(trustedPendingBookings(undefined, opts)).toEqual([])
  })

  it('drops a block that ends before (or as) it starts', () => {
    expect(trustedPendingBookings([{ ...ok, ends_at: iso(0, 9) }, { ...ok, ends_at: iso(0, 8) }], opts)).toEqual([])
  })

  it('drops a block longer than a day', () => {
    expect(trustedPendingBookings([{ ...ok, ends_at: iso(1, 9, 1) }], opts)).toEqual([])
    expect(trustedPendingBookings([{ ...ok, ends_at: iso(1, 9) }], opts)).toHaveLength(1)
  })

  it('drops a block outside the week asked about', () => {
    expect(trustedPendingBookings([{ ...ok, starts_at: iso(-1, 9), ends_at: iso(-1, 10) }], opts)).toEqual([])
    expect(trustedPendingBookings([{ ...ok, starts_at: iso(6, 23), ends_at: iso(7, 1) }], opts)).toEqual([])
  })

  it('drops a block for anything but one of the student\'s open to-dos', () => {
    expect(trustedPendingBookings([{ ...ok, id: 'someone-else' }], opts)).toEqual([])
  })
})
