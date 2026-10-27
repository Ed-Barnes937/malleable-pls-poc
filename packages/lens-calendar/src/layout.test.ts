import { describe, it, expect } from 'vitest'
import type { PlanItemOccurrence } from '@pls/substrate'
import { dueMarkers, isMovable, layoutDays } from './layout'
import { addDays } from './time'

const monday = new Date(2026, 9, 26) // Mon 26 Oct 2026, local
const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 26 + day, h, m).toISOString()

let n = 0
function row(patch: Partial<PlanItemOccurrence>): PlanItemOccurrence {
  const id = `p${++n}`
  const base = {
    id, kind: 'task', title: id, starts_at: null, ends_at: null, due_at: null, duration_min: null,
    status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null,
    source_offset_ms: null, course: null, created_at: at(0, 0), updated_at: at(0, 0),
    ...patch,
  } as PlanItem
  return {
    ...base,
    occurrence_key: patch.occurrence_key ?? id,
    series_starts_at: base.starts_at,
    series_ends_at: base.ends_at,
    series_due_at: base.due_at,
  }
}
type PlanItem = Omit<PlanItemOccurrence, 'occurrence_key' | 'series_starts_at' | 'series_ends_at' | 'series_due_at'>

describe('layoutDays', () => {
  it('places a block on its day in wall-clock minutes', () => {
    const lecture = row({ kind: 'commitment', starts_at: at(1, 9, 30), ends_at: at(1, 11) })
    const days = layoutDays([lecture], week)
    expect(days[1]).toHaveLength(1)
    expect(days[1][0]).toMatchObject({ startMin: 570, endMin: 660, column: 0, columns: 1 })
    expect(days.filter((d) => d.length > 0)).toHaveLength(1)
  })

  it('splits a block that runs past midnight', () => {
    const shift = row({ kind: 'commitment', starts_at: at(3, 22), ends_at: at(4, 1) })
    const days = layoutDays([shift], week)
    expect(days[3][0]).toMatchObject({ startMin: 1320, endMin: 1440, continuesAfter: true, continuesBefore: false })
    expect(days[4][0]).toMatchObject({ startMin: 0, endMin: 60, continuesBefore: true, continuesAfter: false })
  })

  it('ends a block at midnight on its own day only', () => {
    const late = row({ kind: 'commitment', starts_at: at(2, 23), ends_at: at(3, 0) })
    const days = layoutDays([late], week)
    expect(days[2][0]).toMatchObject({ startMin: 1380, endMin: 1440 })
    expect(days[3]).toHaveLength(0)
  })

  it('puts overlapping blocks side by side and leaves others full width', () => {
    const a = row({ starts_at: at(0, 9), ends_at: at(0, 11) })
    const b = row({ starts_at: at(0, 10), ends_at: at(0, 12) })
    const c = row({ starts_at: at(0, 11), ends_at: at(0, 12) }) // reuses a's column
    const d = row({ starts_at: at(0, 14), ends_at: at(0, 15) }) // separate cluster
    const [mon] = layoutDays([d, c, b, a], week)
    const byId = Object.fromEntries(mon.map((s) => [s.item.id, s]))
    expect(byId[a.id]).toMatchObject({ column: 0, columns: 2 })
    expect(byId[b.id]).toMatchObject({ column: 1, columns: 2 })
    expect(byId[c.id]).toMatchObject({ column: 0, columns: 2 })
    expect(byId[d.id]).toMatchObject({ column: 0, columns: 1 })
  })

  it('ignores untimed rows and rows outside the days shown', () => {
    const due = row({ kind: 'deadline', due_at: at(2, 17) })
    const nextWeek = row({ starts_at: at(8, 9), ends_at: at(8, 10) })
    expect(layoutDays([due, nextWeek], week).flat()).toHaveLength(0)
  })
})

describe('dueMarkers', () => {
  it('lists deadlines by day and time; to-dos never get a marker of their own', () => {
    const report = row({ kind: 'deadline', due_at: at(4, 17) })
    const quiz = row({ kind: 'deadline', due_at: at(4, 9) })
    const todo = row({ kind: 'task', due_at: at(2, 12) })
    const scheduled = row({ kind: 'task', starts_at: at(2, 9), ends_at: at(2, 10), due_at: at(2, 12) })
    const days = dueMarkers([report, quiz, todo, scheduled], week)
    expect(days[4].map((m) => m.item.id)).toEqual([quiz.id, report.id])
    expect(days[4][1].minute).toBe(17 * 60)
    expect(days[2]).toEqual([])
    expect(days[4][1].allDay).toBe(false)
  })

  it('treats a due time of local midnight as due that day, with no time', () => {
    const essay = row({ kind: 'deadline', due_at: at(1, 0) })
    expect(dueMarkers([essay], week)[1][0]).toMatchObject({ minute: 0, allDay: true })
  })
})

describe('isMovable', () => {
  it('lets only open, scheduled study time move by drag', () => {
    expect(isMovable(row({ kind: 'task', starts_at: at(0, 9), ends_at: at(0, 10) }))).toBe(true)
    expect(isMovable(row({ kind: 'task', starts_at: at(0, 9), ends_at: at(0, 10), status: 'done' }))).toBe(false)
    expect(isMovable(row({ kind: 'task' }))).toBe(false)
    expect(isMovable(row({ kind: 'commitment', starts_at: at(0, 9), ends_at: at(0, 10) }))).toBe(false)
  })
})
