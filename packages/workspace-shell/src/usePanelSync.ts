import { useLayoutEffect, useRef, useState } from 'react'
import type { PanelManifest } from '@pls/lens-framework'
import { STACK_BREAKPOINT, tidyLayout, useCanvasStore, type PanelItem } from '@pls/panel-system'

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
 * Before the browser paints, so another board never shows the last one's
 * widgets for a frame.
 *
 * Returns the board whose panels the canvas store holds: until a newly
 * opened board's rows arrive, the store still holds the last board's.
 */
export function usePanelSync(
  activeWorkspaceId: string | null,
  panels: PanelRow[] | undefined,
  manifests: PanelManifest[],
  canvasRef: React.RefObject<HTMLDivElement | null>,
) {
  const setPanels = useCanvasStore((s) => s.setPanels)
  const syncedWorkspaceRef = useRef<string | null>(null)
  const [syncedWorkspace, setSyncedWorkspace] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (!panels) return

    if (syncedWorkspaceRef.current !== activeWorkspaceId) {
      syncedWorkspaceRef.current = activeWorkspaceId
      const items = panels.map((p) => buildItem(p, manifests))
      setPanels(items)
      setSyncedWorkspace(activeWorkspaceId)

      // Tidy up a board whose widgets all sit at the same spot (the migration
      // default). Only on the desktop layout: a phone shows them stacked
      // anyway, and must not save a layout worked out for its width.
      if (items.length > 1 && items.every((p) => p.pos_x === items[0].pos_x && p.pos_y === items[0].pos_y)) {
        const el = canvasRef.current
        if (el && el.clientWidth >= STACK_BREAKPOINT) {
          const store = useCanvasStore.getState()
          store.arrangePanels(tidyLayout(store.panels, { width: el.clientWidth, height: el.clientHeight }))
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

  return syncedWorkspace
}
