import { useCallback, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useWorkspaces, useUpdateWorkspaceBackground } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'

/** Workspace background configuration */
export type BackgroundType = 'solid' | 'gradient' | 'image' | 'none'

export interface BackgroundConfig {
  type: BackgroundType
  value: string
}

export const DEFAULT_BACKGROUND: BackgroundConfig = { type: 'none', value: '' }

/** Debounce delay for persisting background changes (ms) */
const DEBOUNCE_MS = 500

/**
 * Internal store for the optimistic background state per workspace.
 * This lets the UI update instantly while the mutation is debounced.
 */
interface BackgroundStore {
  /** Map of workspaceId -> optimistic BackgroundConfig */
  overrides: Record<string, BackgroundConfig>
  setOverride: (workspaceId: string, config: BackgroundConfig) => void
  clearOverride: (workspaceId: string) => void
}

export const useBackgroundStore = create<BackgroundStore>((set) => ({
  overrides: {},
  setOverride: (workspaceId, config) =>
    set((state) => ({
      overrides: { ...state.overrides, [workspaceId]: config },
    })),
  clearOverride: (workspaceId) =>
    set((state) => {
      const { [workspaceId]: _, ...rest } = state.overrides
      return { overrides: rest }
    }),
}))

/**
 * Hook that returns the current background for the active workspace
 * and a setter that persists changes via tRPC mutation with debounce.
 *
 * Priority: optimistic override > DB value > default
 */
export function useWorkspaceBackground() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: workspaces } = useWorkspaces()
  const updateBackground = useUpdateWorkspaceBackground()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const override = useBackgroundStore((s) => s.overrides[activeWorkspaceId])
  const setOverride = useBackgroundStore((s) => s.setOverride)
  const clearOverride = useBackgroundStore((s) => s.clearOverride)

  // Derive background from DB when no optimistic override exists
  const activeWorkspace = workspaces?.find(
    (ws: { id: string }) => ws.id === activeWorkspaceId,
  ) as { id: string; background_type?: string; background_value?: string } | undefined

  const dbBackground: BackgroundConfig =
    activeWorkspace?.background_type && activeWorkspace.background_type !== 'none'
      ? {
          type: activeWorkspace.background_type as BackgroundType,
          value: activeWorkspace.background_value ?? '',
        }
      : activeWorkspace?.background_type === 'none'
        ? DEFAULT_BACKGROUND
        : DEFAULT_BACKGROUND

  const background: BackgroundConfig = override ?? dbBackground

  // When the DB data arrives and matches our override, clear the override
  // to avoid stale optimistic state
  useEffect(() => {
    if (
      override &&
      activeWorkspace?.background_type === override.type &&
      activeWorkspace?.background_value === override.value
    ) {
      clearOverride(activeWorkspaceId)
    }
  }, [activeWorkspace?.background_type, activeWorkspace?.background_value, override, activeWorkspaceId, clearOverride])

  const setBackground = useCallback(
    (config: BackgroundConfig) => {
      // Optimistic update
      setOverride(activeWorkspaceId, config)

      // Debounce the mutation
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        updateBackground.mutate({
          workspaceId: activeWorkspaceId,
          backgroundType: config.type,
          backgroundValue: config.value,
        })
        timerRef.current = null
      }, DEBOUNCE_MS)
    },
    [activeWorkspaceId, setOverride, updateBackground],
  )

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return { background, setBackground }
}
