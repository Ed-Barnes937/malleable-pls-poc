import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { PlanItem, RefitProposal } from '@pls/substrate'
import { ANSWERED_STORAGE_KEY, movedNote, noFitLabel, reloadMissedBlockAnswers, useMissedBlocks } from './missed-blocks'
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

describe('useMissedBlocks: answers are kept (decision 4)', () => {
  afterEach(() => {
    localStorage.clear()
    reloadMissedBlockAnswers()
  })

  it('"Not now" holds after a reload, until a further block is missed', () => {
    const first = renderBoth()
    act(() => first.result.current.calendar.markHandled(first.result.current.calendar.proposals))
    expect(first.result.current.calendar.proposals).toEqual([])
    first.unmount()

    // A reload reads what was kept.
    reloadMissedBlockAnswers()
    const again = renderBoth()
    expect(again.result.current.calendar.proposals).toEqual([])
    again.unmount()

    // The lab block is missed again (a new miss of it): only that is asked about.
    const missedAgain = proposal('lab', 'chemistry', { item: { ...preview[2].item, ends_at: '2026-10-28T10:00:00.000Z' } })
    const later = [preview[0], preview[1], missedAgain]
    const laterReader = { useRefitPreview: () => ({ data: later, isLoading: false, error: null, refetch: async () => later }) } as unknown as SubstrateReader
    const third = renderHook(() => useMissedBlocks(), {
      wrapper: ({ children }) => <SubstrateProvider reader={laterReader} writer={writer}>{children}</SubstrateProvider>,
    })
    expect(ids(third.result.current.proposals)).toEqual(['lab'])
    // The old miss of lab is forgotten: it was missed again.
    expect(JSON.parse(localStorage.getItem(ANSWERED_STORAGE_KEY)!)).toEqual(['notes@2026-10-27T10:00:00.000Z', 'practice@2026-10-27T10:00:00.000Z'])
    third.unmount()
  })

  it('an answer holds while its block is briefly not missed: an Undo that brings the same miss back asks nothing', () => {
    const first = renderBoth()
    act(() => first.result.current.calendar.markHandled(first.result.current.calendar.proposals))
    first.unmount()

    // Not doing, a tick, or a delete: the blocks are not missed for a moment.
    const none: RefitProposal[] = []
    const emptyReader = { useRefitPreview: () => ({ data: none, isLoading: false, error: null, refetch: async () => none }) } as unknown as SubstrateReader
    const gone = renderHook(() => useMissedBlocks(), {
      wrapper: ({ children }) => <SubstrateProvider reader={emptyReader} writer={writer}>{children}</SubstrateProvider>,
    })
    expect(gone.result.current.proposals).toEqual([])
    gone.unmount()

    // Undo: the same misses are back, and stay answered.
    const back = renderBoth()
    expect(back.result.current.calendar.proposals).toEqual([])
    back.unmount()
  })

  it('still answers for this page when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result, unmount } = renderBoth()
    act(() => result.current.calendar.markHandled(result.current.calendar.proposals))
    expect(result.current.calendar.proposals).toEqual([])
    setItem.mockRestore()
    unmount()
  })
})

describe('noFitLabel', () => {
  it('says there is no free time', () => {
    expect(noFitLabel(proposal('notes', 'biology', { starts_at: null, ends_at: null, reason: 'no-free-slot' })))
      .toBe('No free time this week. It stays on your list.')
  })
})

describe('movedNote', () => {
  // Thursday 29 Oct 2026, 11:20 London: the week of 26 Oct.
  const now = Date.parse('2026-10-29T11:20:00Z')
  const sat = '2026-10-31T09:00:00.000Z'
  const mon = '2026-11-02T12:15:00.000Z'
  const later = '2026-11-10T09:00:00.000Z'

  it("says they're in the calendar when they stay this week", () => {
    expect(movedNote([sat, sat], [], now)).toBe("Moved 2 blocks. They're in your calendar.")
    expect(movedNote([sat], [], now)).toBe("Moved 1 block. It's in your calendar.")
  })

  it('names the week they went to when it is a later one', () => {
    expect(movedNote([mon, mon], [], now)).toBe('Moved 2 blocks to next week.')
    expect(movedNote([later], [], now)).toBe('Moved 1 block to the week of 9 Nov.')
  })

  it('splits by week when they went to more than one', () => {
    expect(movedNote([mon, sat, later], [], now)).toBe('Moved 3 blocks: 1 this week, 1 next week, 1 in the week of 9 Nov.')
  })

  it('still reports the ones that did not fit', () => {
    const noFit = proposal('notes', 'biology', { starts_at: null, ends_at: null, reason: 'no-free-slot' })
    expect(movedNote([mon], [noFit], now)).toBe("Moved 1 block to next week. 1 didn't fit this week, so it stays on your to-do list.")
    expect(movedNote([], [noFit], now)).toBe("1 didn't fit this week, so it stays on your to-do list.")
  })
})
