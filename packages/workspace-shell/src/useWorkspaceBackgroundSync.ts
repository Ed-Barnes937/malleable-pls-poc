import { useEffect, useRef } from 'react'
import { useUpdateWorkspaceBackground } from '@pls/substrate-client'
import { useCanvasStore } from '@pls/panel-system'

type WorkspaceRow = { id: string; background_type?: string; background_value?: string }

/**
 * Two-way sync between the DB workspace background and the canvas store.
 * DB→store: reads background from the workspace list on workspace switch.
 * Store→DB: persists user-driven background changes, skipping the initial load.
 */
export function useWorkspaceBackgroundSync(
  activeWorkspaceId: string,
  workspaces: unknown[] | undefined,
) {
  const setBackground = useCanvasStore((s) => s.setBackground)
  const background = useCanvasStore((s) => s.background)
  const updateBackground = useUpdateWorkspaceBackground()

  // DB → store
  useEffect(() => {
    if (!workspaces) return
    const ws = (workspaces as WorkspaceRow[]).find((w) => w.id === activeWorkspaceId)
    if (ws?.background_type && ws.background_type !== 'none') {
      setBackground({
        type: ws.background_type as 'solid' | 'gradient' | 'image',
        value: ws.background_value ?? '',
      })
    } else {
      setBackground({ type: 'none', value: '' })
    }
  }, [workspaces, activeWorkspaceId, setBackground])

  // Store → DB: skip the initial sync from DB
  const prevBgRef = useRef<string>('')
  useEffect(() => {
    const key = `${background.type}:${background.value}`
    if (key === prevBgRef.current) return
    if (prevBgRef.current === '') {
      prevBgRef.current = key
      return
    }
    prevBgRef.current = key
    updateBackground.mutate({
      workspaceId: activeWorkspaceId,
      backgroundType: background.type,
      backgroundValue: background.value,
    })
  }, [background, activeWorkspaceId, updateBackground])
}
