import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { PlanItem, RefitProposal } from '@pls/substrate'
import { noFitLabel, useMissedBlocks } from './missed-blocks'
import { SubstrateProvider } from './substrate-context'
import type { SubstrateReader, SubstrateWriter } from './substrate-contract'

function proposal(id: string, course: string, overrides: Partial<RefitProposal> = {}): RefitProposal {
  return {
    item: {
      id, title: id, course, kind: 'task', status: 'open', starts_at: '2026-10-27T09:00:00.000Z', ends_at: '2026-10-27T10:00:00.000Z',
      due_at: null, duration_min: 60, recurrence: null, subtype: null, source_type: null, source_id: null, source_offset_ms: null,
      created_by_workflow_id: null, created_at: '2026-10-20T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z',
    } as PlanItem,
    starts_at: '2026-10-29T09:00:00.000Z',
    ends_at: '2026-10-29T10:00:00.000Z',
    reason: null,
    ...overrides,
  }
}

const preview = [proposal('notes', 'biology'), proposal('practice', 'biology'), proposal('lab', 'chemistry')]

const reader = {
  useRefitPreview: () => ({ data: preview, isLoading: false, error: null, refetch: async () => preview }),
} as unknown as SubstrateReader
const writer = { useAcceptRefit: () => ({ mutateAsync: async () => ({ moved: 0 }) }) } as unknown as SubstrateWriter

/** Two widgets asking at once, as the To-do (Biology board) and the Calendar (every course) do. */
function renderBoth() {
  return renderHook(() => ({ todo: useMissedBlocks({ course: 'biology' }), calendar: useMissedBlocks() }), {
    wrapper: ({ children }) => <SubstrateProvider reader={reader} writer={writer}>{children}</SubstrateProvider>,
  })
}

const ids = (ps: RefitProposal[]) => ps.map((p) => p.item.id)

describe('useMissedBlocks: one preview at a time', () => {
  it("while one widget shows new times, the others stop asking about those blocks, and ask again once it ends", () => {
    const { result } = renderBoth()
    expect(ids(result.current.calendar.proposals)).toEqual(['notes', 'practice', 'lab'])

    act(() => result.current.todo.startPreview(result.current.todo.proposals))
    // The To-do still shows its own; the Calendar only asks about the rest.
    expect(ids(result.current.todo.proposals)).toEqual(['notes', 'practice'])
    expect(ids(result.current.calendar.proposals)).toEqual(['lab'])
    expect(ids(result.current.calendar.toAsk(preview))).toEqual(['lab'])

    act(() => result.current.todo.endPreview())
    expect(ids(result.current.calendar.proposals)).toEqual(['notes', 'practice', 'lab'])
  })

  it('a widget that goes away mid-preview gives its blocks back', () => {
    const { result, unmount } = renderBoth()
    act(() => result.current.calendar.startPreview(result.current.calendar.proposals))
    expect(result.current.todo.proposals).toEqual([])
    unmount()
    const again = renderBoth()
    expect(ids(again.result.current.todo.proposals)).toEqual(['notes', 'practice'])
    again.unmount()
  })
})

describe('noFitLabel', () => {
  it("names a block longer than a day's study time in Help me plan's words", () => {
    expect(noFitLabel(proposal('long', 'chemistry', { starts_at: null, ends_at: null, reason: 'over-daily-budget' })))
      .toBe('Longer than your 2h a day. It stays on your list.')
  })

  it('otherwise says there is no free time', () => {
    expect(noFitLabel(proposal('notes', 'biology', { starts_at: null, ends_at: null, reason: 'no-free-slot' })))
      .toBe('No free time this week. It stays on your list.')
  })
})
