import { create } from 'zustand'
import type { FocusedMoment, Moment } from '@pls/lens-framework'

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
}

let nextMomentId = 0

export const useWorkspaceStore = create<WorkspaceUIState>((set) => ({
  activeWorkspaceId: 'ws-in-lecture',
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  focusedPanelId: null,
  setFocusedPanelId: (id) => set({ focusedPanelId: id }),

  focusedMoment: null,
  focusMoment: (moment, options) => set({ focusedMoment: { ...moment, id: ++nextMomentId, ...(options?.takeFocus ? { takeFocus: true } : {}) } }),
  clearMoment: (id) => set((s) => (s.focusedMoment?.id === id ? { focusedMoment: null } : s)),
}))
