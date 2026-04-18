import { create } from 'zustand'

interface WorkspaceUIState {
  activeWorkspaceId: string
  setActiveWorkspaceId: (id: string) => void

  focusedPanelId: string | null
  setFocusedPanelId: (id: string | null) => void
}

export const useWorkspaceStore = create<WorkspaceUIState>((set) => ({
  activeWorkspaceId: 'ws-evening-review',
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  focusedPanelId: null,
  setFocusedPanelId: (id) => set({ focusedPanelId: id }),
}))
