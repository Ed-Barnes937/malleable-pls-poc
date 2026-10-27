import { describe, it, expect } from 'vitest'
import { chooseMomentBoard, hasMomentViewer, hasPlanItemViewer } from './moments'
import { useWorkspaceStore } from './store'

const manifests = [
  { id: 'transcript', showsMoments: true },
  { id: 'calendar' },
  { id: 'test-me', showsMoments: false },
]

describe('hasMomentViewer', () => {
  it('is true only when a widget declares showsMoments', () => {
    expect(hasMomentViewer(['calendar', 'transcript'], manifests)).toBe(true)
    expect(hasMomentViewer(['calendar', 'test-me'], manifests)).toBe(false)
    expect(hasMomentViewer([], manifests)).toBe(false)
    expect(hasMomentViewer(['unknown'], manifests)).toBe(false)
  })
})

describe('hasPlanItemViewer', () => {
  it('is true only when a widget declares showsPlanItems', () => {
    const flags = [{ id: 'calendar', showsPlanItems: true }, { id: 'transcript' }]
    expect(hasPlanItemViewer(['transcript', 'calendar'], flags)).toBe(true)
    expect(hasPlanItemViewer(['transcript'], flags)).toBe(false)
  })
})

describe('chooseMomentBoard', () => {
  it('prefers a board with a viewer already focused on the recording', () => {
    const boards = [
      { id: 'plan', lensTypes: ['calendar'], recordingId: 'rec-1' },
      { id: 'lecture', lensTypes: ['transcript'], recordingId: 'rec-2' },
      { id: 'review', lensTypes: ['transcript', 'test-me'], recordingId: 'rec-1' },
    ]
    expect(chooseMomentBoard(boards, manifests, 'rec-1')).toBe('review')
  })

  it('falls back to the first board with a viewer', () => {
    const boards = [
      { id: 'plan', lensTypes: ['calendar'] },
      { id: 'lecture', lensTypes: ['transcript'] },
      { id: 'review', lensTypes: ['transcript'], recordingId: 'rec-3' },
    ]
    expect(chooseMomentBoard(boards, manifests, 'rec-1')).toBe('lecture')
  })

  it('returns undefined when no board can show a moment', () => {
    expect(chooseMomentBoard([{ id: 'plan', lensTypes: ['calendar'] }], manifests, 'rec-1')).toBeUndefined()
  })
})

describe('focused moment', () => {
  it('is dropped once shown, unless a newer one replaced it', () => {
    const { focusMoment, clearMoment } = useWorkspaceStore.getState()
    focusMoment({ recordingId: 'rec-1', offsetMs: 1000 })
    const first = useWorkspaceStore.getState().focusedMoment!
    focusMoment({ recordingId: 'rec-1', offsetMs: 2000 })
    clearMoment(first.id)
    expect(useWorkspaceStore.getState().focusedMoment?.offsetMs).toBe(2000)
    clearMoment(useWorkspaceStore.getState().focusedMoment!.id)
    expect(useWorkspaceStore.getState().focusedMoment).toBeNull()
  })
})

describe('focusPlanItem', () => {
  it('issues a new request each time, and clears only the one shown', () => {
    const { focusPlanItem, clearPlanItem } = useWorkspaceStore.getState()
    focusPlanItem({ id: 'r1', startsAt: '2026-11-04T19:30:00Z' })
    const first = useWorkspaceStore.getState().focusedPlanItem!
    focusPlanItem({ id: 'r1', startsAt: '2026-11-04T19:30:00Z' })
    const second = useWorkspaceStore.getState().focusedPlanItem!
    expect(second.requestId).toBeGreaterThan(first.requestId)
    clearPlanItem(first.requestId)
    expect(useWorkspaceStore.getState().focusedPlanItem).toEqual(second)
    clearPlanItem(second.requestId)
    expect(useWorkspaceStore.getState().focusedPlanItem).toBeNull()
  })
})
