import { describe, it, expect } from 'vitest'
import type { PlanItemOccurrence } from '@pls/substrate'
import { blockTimes, type GridSpan } from './grid-spans'
import { layoutDays } from './layout'

// A week of days from Monday 23 Nov 2026 (London: UTC in November).
const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 23 + i))
const at = (day: number, h: number, m = 0) => new Date(2026, 10, 23 + day, h, m)

function row(start: Date, end: Date): PlanItemOccurrence {
  return {
    id: 'late', occurrence_key: 'late', kind: 'task', title: 'Late revision',
    starts_at: start.toISOString(), ends_at: end.toISOString(), due_at: null, duration_min: null,
    status: 'open', recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null,
    created_by_workflow_id: null, course: null, created_at: '', updated_at: '',
    series_starts_at: start.toISOString(), series_ends_at: end.toISOString(), series_due_at: null,
  }
}

/** Each day piece of `item` as the grid's span. */
function pieces(item: PlanItemOccurrence): GridSpan[] {
  return layoutDays([item], days).flat().map((seg) => ({ id: seg.key, track: String(seg.dayIndex), start: seg.startMin, end: seg.endMin, seg }))
}

describe('blockTimes: a day piece put somewhere new, as the whole block', () => {
  it('a block within a day moves to the piece\'s new place', () => {
    const item = row(at(2, 16), at(2, 17))
    const [piece] = pieces(item)
    expect(blockTimes(item, piece, { ...piece, track: '4', start: 600, end: 660 }, days)).toEqual({ start: at(4, 10), end: at(4, 11) })
  })

  it('moving the second piece of a block across midnight moves the whole block, keeping its times of day', () => {
    const item = row(at(2, 23), at(3, 1))
    const [, second] = pieces(item)
    expect(blockTimes(item, second, { ...second, start: 15, end: 75 }, days)).toEqual({ start: at(2, 23, 15), end: at(3, 1, 15) })
    expect(blockTimes(item, second, { ...second, track: '4' }, days)).toEqual({ start: at(3, 23), end: at(4, 1) })
  })

  it('moving the first piece moves the whole block', () => {
    const item = row(at(2, 23), at(3, 1))
    const [first] = pieces(item)
    expect(blockTimes(item, first, { ...first, start: 1365, end: 1425 }, days)).toEqual({ start: at(2, 22, 45), end: at(3, 0, 45) })
    expect(blockTimes(item, first, { ...first, track: '1' }, days)).toEqual({ start: at(1, 23), end: at(2, 1) })
  })

  it('resizing the second piece\'s end moves the block\'s end; its start stays', () => {
    const item = row(at(2, 23), at(3, 1))
    const [, second] = pieces(item)
    expect(blockTimes(item, second, { ...second, end: 90 }, days)).toEqual({ start: at(2, 23), end: at(3, 1, 30) })
  })
})
