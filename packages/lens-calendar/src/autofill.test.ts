import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { weekLayout, type PlanItem } from '@pls/substrate'
import { buildAutofillDraft, unplacedReason } from './autofill'
import { acceptPatch, ghostId, ghostRow, useProposalLayer, type Proposal } from './proposals'

// Mon 2 Nov 2026 (GMT, local = UTC in the test zone).
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 10, 2 + day, h, m)
const iso = (day: number, h: number, m = 0) => new Date(at(day, h, m)).toISOString()
const layout = weekLayout([], { start: at(0, 0), end: at(7, 0) }, { timeZone: 'Europe/London' })

function todo(id: string, over: Partial<PlanItem> = {}) {
  return { id, title: id, course: null, due_at: null, duration_min: 60, subtype: null, ...over }
}

describe('buildAutofillDraft', () => {
  const todos = [todo('lab', { duration_min: 240, course: 'chemistry' }), todo('quiz'), todo('cards', { duration_min: null })]

  it('places in the advised order, reports what did not fit, and applies trims', () => {
    const advice = { order: ['quiz', 'lab', 'cards'] }
    const draft = buildAutofillDraft({ todos, layout, now: at(0, 0), advice, estimates: { cards: 60 } })
    expect(draft.proposals.map((p) => [p.taskId, p.startsAt])).toEqual([['quiz', iso(0, 8)], ['cards', iso(0, 9, 15)]])
    expect(draft.unplaced.map((u) => [u.taskId, u.reason])).toEqual([['lab', 'over-daily-budget']])

    const trimmed = buildAutofillDraft({ todos, layout, now: at(0, 0), advice, trims: new Map([['lab', 120]]), estimates: { cards: 60 } })
    const lab = trimmed.proposals.find((p) => p.taskId === 'lab')!
    expect(lab).toMatchObject({ startsAt: iso(1, 8), endsAt: iso(1, 10), note: 'Shrunk from 4h', course: 'chemistry' })
  })

  it('keeps pinned (dragged) ghosts where they are and places around them', () => {
    const pinned: Proposal = { id: 'quiz', taskId: 'quiz', title: 'quiz', startsAt: iso(0, 8), endsAt: iso(0, 10), adjusted: true }
    const draft = buildAutofillDraft({ todos: [todo('quiz', { duration_min: 120 }), todo('cards')], layout, now: at(0, 0), advice: { order: ['cards', 'quiz'] }, pinned: [pinned] })
    // Monday's 2h are spent by the pinned ghost, so cards goes to Tuesday.
    expect(draft.proposals.map((p) => [p.taskId, p.startsAt])).toEqual([['quiz', iso(0, 8)], ['cards', iso(1, 8)]])
  })

  it('words the reasons calmly', () => {
    expect(unplacedReason('over-daily-budget', 120)).toBe('longer than your 2h a day')
    expect(unplacedReason('window-closed', 120)).toBe('not enough time before it is due')
    expect(unplacedReason('invalid-duration', 120)).toBe('it needs an estimate')
    expect(unplacedReason('no-free-slot', 120)).toBe('no free gap long enough')
  })
})

describe('proposals', () => {
  const ghost: Proposal = { id: 'g1', taskId: 't1', title: 'Quiz prep', startsAt: iso(0, 8), endsAt: iso(0, 9, 30) }

  it('maps a proposal to a ghost row and to the patch accepting it writes', () => {
    const row = ghostRow(ghost)
    expect(ghostId(row)).toBe('g1')
    expect(ghostId({ occurrence_key: 'real' })).toBeNull()
    expect(acceptPatch(ghost)).toEqual({ starts_at: iso(0, 8), ends_at: iso(0, 9, 30), duration_min: 90 })
  })

  it('proposes, adjusts, dismisses and keeps the plan without saving anything', () => {
    const save = vi.fn()
    const { result } = renderHook(() => useProposalLayer({ save, rows: [] }))
    act(() => result.current.propose('autofill', [ghost, { ...ghost, id: 'g2', taskId: 't2' }]))
    expect(result.current.source).toBe('autofill')
    act(() => result.current.move('g1', iso(1, 8), iso(1, 9)))
    expect(result.current.proposals[0]).toMatchObject({ startsAt: iso(1, 8), adjusted: true })
    act(() => result.current.dismiss('g2'))
    expect(result.current.proposals.map((p) => p.id)).toEqual(['g1'])
    act(() => result.current.dismissAll())
    expect(result.current.proposals).toEqual([])
    expect(result.current.source).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('saves accepted ones, keeps them drawn until the real block arrives, and says when a save fails', async () => {
    const save = vi.fn(async (p: Proposal) => {
      if (p.id === 'bad') throw new Error('nope')
    })
    let rows: { id: string; starts_at: string | null }[] = []
    const { result, rerender } = renderHook(() => useProposalLayer({ save, rows }))
    act(() => result.current.propose('autofill', [ghost, { ...ghost, id: 'bad', taskId: 'tb', title: 'Bad one' }]))
    await act(() => result.current.acceptAll())
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.savedIds.has('g1')).toBe(true)
    expect(result.current.error).toMatch(/"Bad one"/)
    expect(result.current.proposals.map((p) => p.id)).toEqual(['g1', 'bad'])

    rows = [{ id: 't1', starts_at: ghost.startsAt }]
    rerender()
    expect(result.current.proposals.map((p) => p.id)).toEqual(['bad'])
    // Accepting an already-saved one does nothing.
    await act(() => result.current.accept('g1'))
    expect(save).toHaveBeenCalledTimes(2)
  })
})
