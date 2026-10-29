import { create } from 'zustand'
import type { FocusedMoment, FocusedPlanItem, Moment, PlanItemRef } from '@pls/lens-framework'
import { watchUserScroll } from '@pls/shared-ui'

interface WorkspaceUIState {
  activeWorkspaceId: string
  setActiveWorkspaceId: (id: string) => void

  focusedPanelId: string | null
  setFocusedPanelId: (id: string | null) => void

  /**
   * The recording moment last asked to be shown (see `useShowMoment`).
   * Ephemeral and app-wide rather than per board, so it survives switching
   * to a board that has a Transcript.
   */
  focusedMoment: FocusedMoment | null
  /** `takeFocus`: the viewer also moves keyboard focus to the moment (e.g. after a board switch). */
  focusMoment: (moment: Moment, options?: { takeFocus?: boolean }) => void
  /** A viewer has shown the moment: drop it, unless a newer one replaced it. */
  clearMoment: (id: number) => void

  /** The block last asked to be shown on the calendar ("See it"). Ephemeral, like `focusedMoment`. */
  focusedPlanItem: FocusedPlanItem | null
  focusPlanItem: (item: PlanItemRef) => void
  /** A calendar has shown it: drop it, unless a newer request replaced it. */
  clearPlanItem: (requestId: number) => void
}

let nextMomentId = 0
let nextPlanItemRequest = 0

export const useWorkspaceStore = create<WorkspaceUIState>((set) => ({
  activeWorkspaceId: 'ws-in-lecture',
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  focusedPanelId: null,
  setFocusedPanelId: (id) => set({ focusedPanelId: id }),

  focusedMoment: null,
  focusMoment: (moment, options) => set({ focusedMoment: { ...moment, id: ++nextMomentId, ...(options?.takeFocus ? { takeFocus: true } : {}) } }),
  clearMoment: (id) => set((s) => (s.focusedMoment?.id === id ? { focusedMoment: null } : s)),

  focusedPlanItem: null,
  focusPlanItem: (item) => {
    const now = watchUserScroll()
    set({ focusedPlanItem: { ...item, requestId: ++nextPlanItemRequest, requestedAt: Math.min(now, item.scrolledSince ?? now) } })
  },
  clearPlanItem: (requestId) =>
    set((s) => (s.focusedPlanItem?.requestId === requestId ? { focusedPlanItem: null } : s)),
}))
