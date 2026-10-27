import { describe, it, expect } from 'vitest'
import { isMissedBlock, planRefit, refitConflict, refitRange } from './planning'
import type { PlanItem, PlanItemOccurrence } from './types'

const TZ = 'Europe/London'
// Wednesday 28 Oct 2026, 12:00 London (GMT, after the clocks went back).
const NOW = Date.parse('2026-10-28T12:00:00Z')

function item(overrides: Partial<PlanItem>): PlanItem {
  return {
    id: 'pi-1',
    kind: 'task',
    title: 'Read chapter 5',
    starts_at: null,
    ends_at: null,
    due_at: null,
    duration_min: null,
    status: 'open',
    recurrence: null,
    subtype: null,
    source_type: null,
    source_id: null,
    source_offset_ms: null,
    course: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function row(p: PlanItem): PlanItemOccurrence {
  return { ...p, occurrence_key: p.id, series_starts_at: p.starts_at, series_ends_at: p.ends_at, series_due_at: p.due_at }
}

const mondayBlock = item({ id: 'a', title: 'Read chapter 5', starts_at: '2026-10-26T18:00:00.000Z', ends_at: '2026-10-26T18:30:00.000Z', duration_min: 30 })
const tuesdayBlock = item({ id: 'b', title: 'Lab write-up', starts_at: '2026-10-27T19:00:00.000Z', ends_at: '2026-10-27T20:00:00.000Z' })
const shift = item({ id: 'shift', kind: 'commitment', title: 'Cafe shift', subtype: 'shift', starts_at: '2026-10-28T12:00:00.000Z', ends_at: '2026-10-28T17:00:00.000Z' })

describe('isMissedBlock', () => {
  it('is an open one-off to-do whose block has ended', () => {
    expect(isMissedBlock(mondayBlock, NOW)).toBe(true)
  })

  it('never a commitment, a done or dismissed to-do, a recurring one, an unscheduled one or one not over yet', () => {
    expect(isMissedBlock({ ...mondayBlock, kind: 'commitment' }, NOW)).toBe(false)
    expect(isMissedBlock({ ...mondayBlock, status: 'done' }, NOW)).toBe(false)
    expect(isMissedBlock({ ...mondayBlock, status: 'dismissed' }, NOW)).toBe(false)
    expect(isMissedBlock({ ...mondayBlock, recurrence: { freq: 'weekly' } }, NOW)).toBe(false)
    expect(isMissedBlock({ ...mondayBlock, starts_at: null, ends_at: null }, NOW)).toBe(false)
    expect(isMissedBlock({ ...mondayBlock, ends_at: '2026-10-28T12:30:00.000Z' }, NOW)).toBe(false)
  })
})

describe('planRefit', () => {
  it('puts missed blocks, oldest first, in the next free time around commitments', () => {
    const proposals = planRefit([tuesdayBlock, mondayBlock], [row(shift)], { now: NOW, timeZone: TZ })
    expect(proposals.map((p) => p.item.id)).toEqual(['a', 'b'])
    // After the shift and its 10-minute buffer, on a quarter hour.
    expect(proposals[0]).toMatchObject({ starts_at: '2026-10-28T17:15:00.000Z', ends_at: '2026-10-28T17:45:00.000Z', reason: null })
    // A block keeps its length when it has no estimate.
    expect(proposals[1]).toMatchObject({ starts_at: '2026-10-28T17:45:00.000Z', ends_at: '2026-10-28T18:45:00.000Z', reason: null })
  })

  it('never overlaps other blocks, which stay where they are', () => {
    const accepted = item({ id: 'accepted', title: 'Essay plan', starts_at: '2026-10-28T17:00:00.000Z', ends_at: '2026-10-28T19:00:00.000Z' })
    const [p] = planRefit([mondayBlock], [row(shift), row(accepted)], { now: NOW, timeZone: TZ })
    expect(p.starts_at).toBe('2026-10-28T19:00:00.000Z')
  })

  it('fits a to-do still due later before it is due, and says when it cannot', () => {
    const dueSoon = { ...mondayBlock, due_at: '2026-10-28T16:00:00.000Z' }
    const [p] = planRefit([dueSoon], [row(shift)], { now: NOW, timeZone: TZ })
    expect(p).toMatchObject({ starts_at: null, ends_at: null, reason: 'no-free-slot' })
  })

  it('places a to-do whose due date has passed in the next free time anyway', () => {
    const overdue = { ...mondayBlock, due_at: '2026-10-27T09:00:00.000Z' }
    const [p] = planRefit([overdue], [row(shift)], { now: NOW, timeZone: TZ })
    expect(p.starts_at).toBe('2026-10-28T17:15:00.000Z')
  })

  it('is empty when nothing was missed', () => {
    expect(planRefit([], [row(shift)], { now: NOW, timeZone: TZ })).toEqual([])
  })
})

describe('refitRange', () => {
  it('runs from the start of local today a week ahead, or to the latest due date', () => {
    expect(refitRange([mondayBlock], { now: NOW, timeZone: TZ })).toEqual({
      start: Date.parse('2026-10-28T00:00:00Z'),
      end: Date.parse('2026-11-05T00:00:00Z'),
    })
    const late = { ...mondayBlock, due_at: '2026-11-20T12:00:00.000Z' }
    expect(refitRange([late], { now: NOW, timeZone: TZ }).end).toBe(Date.parse('2026-11-20T12:00:00.000Z'))
  })
})

describe('refitConflict', () => {
  const block = { start: NOW + 60 * 60_000, end: NOW + 90 * 60_000 }
  it('is null when the block is ahead and free', () => {
    expect(refitConflict(block, [{ start: block.end, end: block.end + 1 }], NOW)).toBeNull()
  })
  it('flags a block that has started or overlaps', () => {
    expect(refitConflict(block, [], block.start + 1)).toBe('started')
    expect(refitConflict(block, [{ start: block.start - 1, end: block.start + 1 }], NOW)).toBe('overlaps')
  })
})
