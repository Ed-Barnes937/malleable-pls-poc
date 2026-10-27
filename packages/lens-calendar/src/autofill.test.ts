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
    act(() => result.current.propose('autofill', [ghost, { ...ghost, id: 'bad', taskId: 'tb', title: 'Bad one', startsAt: iso(1, 8), endsAt: iso(1, 9) }]))
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

  it('re-checks each ghost: takes out ones that no longer hold and refuses bad moves', async () => {
    const save = vi.fn(async () => {})
    let blocked = new Set<string>()
    let clash: string | null = null
    const validate = (p: Proposal) => (blocked.has(p.taskId) ? 'it already has a time' : clash && p.startsAt === iso(1, 9) ? `that time overlaps ${clash}` : null)
    const { result, rerender } = renderHook(() => useProposalLayer({ save, rows: [], validate }))
    const g2: Proposal = { ...ghost, id: 'g2', taskId: 't2', title: 'Reading', startsAt: iso(1, 8), endsAt: iso(1, 9) }
    act(() => result.current.propose('autofill', [ghost, g2]))

    // The to-do got a time by hand: its ghost goes, and the layer says so.
    blocked = new Set(['t1'])
    rerender()
    expect(result.current.proposals.map((p) => p.id)).toEqual(['g2'])
    expect(result.current.notice).toBe('Took "Quiz prep" out of the suggestions: it already has a time.')
    act(() => result.current.clearNotice())

    // A move onto something is refused.
    clash = 'Biology lecture'
    act(() => result.current.move('g2', iso(1, 9), iso(1, 10)))
    expect(result.current.notice).toBe("Can't move \"Reading\" there: that time overlaps Biology lecture.")
    expect(result.current.proposals).toEqual([g2])
  })

  it('never saves a ghost that fails the check at accept time, or one overlapping a ghost accepted before it', async () => {
    const save = vi.fn(async () => {})
    let bad = false
    const validate = (p: Proposal) => (bad && p.id === 'g3' ? 'that time overlaps Cafe shift' : null)
    const { result } = renderHook(() => useProposalLayer({ save, rows: [], validate }))
    const g2: Proposal = { ...ghost, id: 'g2', taskId: 't2', title: 'Overlapping' }
    const g3: Proposal = { ...ghost, id: 'g3', taskId: 't3', title: 'Shifted', startsAt: iso(2, 8), endsAt: iso(2, 9) }
    act(() => result.current.propose('autofill', [ghost, g2, g3]))
    // The check fails between rendering and accepting (e.g. a shift was just added).
    bad = true
    await act(() => result.current.acceptAll())
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(ghost)
    expect(result.current.notice).toContain('Didn\'t save "Overlapping": that time overlaps "Quiz prep".')
    expect(result.current.notice).toContain('Didn\'t save "Shifted": that time overlaps Cafe shift.')
  })
})
