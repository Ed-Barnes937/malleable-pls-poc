import { useEffect, useRef } from 'react'
import type { PanelManifest } from '@pls/lens-framework'
import { useCanvasStore, type PanelItem } from '@pls/panel-system'

export type PanelRow = {
  id: string
  lens_type: string
  pos_x: unknown
  pos_y: unknown
  width: unknown
  height: unknown
  z_index: unknown
}

function buildItem(p: PanelRow, manifests: PanelManifest[]): PanelItem {
  const m = manifests.find((man) => man.id === p.lens_type)
  return {
    id: p.id,
    pos_x: Number(p.pos_x) || 0,
    pos_y: Number(p.pos_y) || 0,
    width: Number(p.width) || 280,
    height: Number(p.height) || 220,
    z_index: Number(p.z_index) || 0,
    title: undefined,
    lensType: p.lens_type,
    constraints: m
      ? { minWidth: m.minWidth, minHeight: m.minHeight, maxWidth: m.maxWidth, maxHeight: m.maxHeight }
      : undefined,
  }
}

/**
 * Syncs DB panel rows into the canvas store.
 * Full sync on workspace switch; incremental add/remove thereafter so
 * user-dragged positions aren't overwritten before they're persisted.
 */
export function usePanelSync(
  activeWorkspaceId: string,
  panels: PanelRow[] | undefined,
  manifests: PanelManifest[],
  canvasRef: React.RefObject<HTMLDivElement | null>,
) {
  const setPanels = useCanvasStore((s) => s.setPanels)
  const syncedWorkspaceRef = useRef<string | null>(null)

  useEffect(() => {
    if (!panels) return

    if (syncedWorkspaceRef.current !== activeWorkspaceId) {
      syncedWorkspaceRef.current = activeWorkspaceId
      const items = panels.map((p) => buildItem(p, manifests))
      setPanels(items)

      // Auto-organize if all panels are stacked at the same position (migration default)
      if (items.length > 1 && items.every((p) => p.pos_x === items[0].pos_x && p.pos_y === items[0].pos_y)) {
        const el = canvasRef.current
        if (el) {
          useCanvasStore.getState().organizePanels(el.clientWidth, el.clientHeight)
        }
      }
      return
    }

    // Incremental sync: only add new panels / remove deleted ones
    const store = useCanvasStore.getState()
    const storeIds = new Set(store.panels.map((p) => p.id))
    const dbIds = new Set(panels.map((p) => p.id))

    for (const p of panels) {
      if (!storeIds.has(p.id)) store.addPanel(buildItem(p, manifests))
    }
    for (const p of store.panels) {
      if (!dbIds.has(p.id)) store.removePanel(p.id)
    }
  }, [panels, activeWorkspaceId, setPanels, manifests])
}
