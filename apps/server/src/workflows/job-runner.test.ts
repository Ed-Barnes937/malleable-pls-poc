import { describe, it, expect } from 'vitest'
import { placedBlock } from './job-runner'

describe('placedBlock', () => {
  it('names the block a run placed, so the toast can offer "See it"', () => {
    expect(placedBlock({ plan_item_id: 'pi-1', title: 'Review', starts_at: '2026-11-04T19:30:00.000Z', ends_at: '2026-11-04T19:50:00.000Z' }))
      .toEqual({ planItem: { id: 'pi-1', startsAt: '2026-11-04T19:30:00.000Z' } })
  })

  it('says when a review was left unscheduled, so the toast says it went to the to-do list', () => {
    expect(placedBlock({ plan_item_id: 'pi-1', starts_at: null, unplaced_reason: 'no-free-slot' })).toEqual({ unplaced: true })
  })

  it('is empty for a duplicate mark or any other job', () => {
    expect(placedBlock({ existing_plan_item_id: 'pi-1', deduplicated: true, quiet: true })).toEqual({})
    expect(placedBlock({ summary: 'Three lines' })).toEqual({})
  })
})
