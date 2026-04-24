import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import {
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useUpdatePanelLayouts,
  useJobRunner,
} from '@pls/substrate'
import type { Scope } from '@pls/lens-framework'
import { PanelGrid, type PanelGridItem } from '@pls/panel-system'
import { useWorkspaceStore } from './store'
import { getLensComponent, useLensRegistry } from './LensRegistry'
import { PanelContainer } from './PanelContainer'
import { Sidebar } from './Sidebar'

function scopesFromDb(scopes: { scope_type: string; scope_value: string }[]): Scope {
  const scope: Scope = {}
  for (const s of scopes) {
    if (s.scope_type === 'tag') scope.courseTag = s.scope_value
    if (s.scope_type === 'recording') scope.recordingId = s.scope_value
    if (s.scope_type === 'timeframe') scope.timeframe = s.scope_value as 'week' | 'all'
  }
  return scope
}

export function WorkspaceShell() {
  const lensRegistry = useLensRegistry()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  useJobRunner(activeWorkspaceId)

  const { data: panels } = useWorkspacePanels(activeWorkspaceId)
  const { data: dbScopes } = useWorkspaceScopes(activeWorkspaceId)

  const addPanel = useAddWorkspacePanel()
  const removePanel = useRemoveWorkspacePanel()
  const updateLayouts = useUpdatePanelLayouts()

  const [transitioning, setTransitioning] = useState(false)
  const prevWorkspaceRef = useRef(activeWorkspaceId)

  useEffect(() => {
    if (prevWorkspaceRef.current !== activeWorkspaceId) {
      setTransitioning(true)
      const timer = setTimeout(() => setTransitioning(false), 150)
      prevWorkspaceRef.current = activeWorkspaceId
      return () => clearTimeout(timer)
    }
  }, [activeWorkspaceId])

  const scope = useMemo(() => scopesFromDb(dbScopes ?? []), [dbScopes])

  const panelConfigs = useMemo(() => {
    if (!panels) return new Map<string, Record<string, unknown>>()
    const map = new Map<string, Record<string, unknown>>()
    for (const p of panels) {
      map.set(p.id, { ...JSON.parse(p.config), lensType: p.lens_type })
    }
    return map
  }, [panels])

  const gridItems = useMemo<PanelGridItem[]>(() => {
    if (!panels) return []
    return panels.map((p) => ({
      id: p.id,
      x: p.grid_x,
      y: p.grid_y,
      w: p.grid_w,
      h: p.grid_h,
    }))
  }, [panels])

  const handleLayoutChange = useCallback(
    (layouts: PanelGridItem[]) => {
      if (!panels?.length) return
      updateLayouts.mutate({
        workspaceId: activeWorkspaceId,
        layouts: layouts.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })),
      })
    },
    [activeWorkspaceId, panels, updateLayouts]
  )

  const handleAddPanel = useCallback(
    (lensType: string, position: { x: number; y: number; w: number; h: number }) => {
      const slotName = `slot-${Date.now()}`
      addPanel.mutate({ workspaceId: activeWorkspaceId, lensType, slotName, position })
    },
    [activeWorkspaceId, addPanel]
  )

  const handleRemovePanel = useCallback(
    (panelId: string) => {
      removePanel.mutate({ panelId, workspaceId: activeWorkspaceId })
    },
    [activeWorkspaceId, removePanel]
  )

  const renderPanel = useCallback(
    (panelId: string) => {
      const panel = panels?.find((p) => p.id === panelId)
      if (!panel) return null
      const LensComponent = getLensComponent(panel.lens_type, lensRegistry)
      const config = panelConfigs.get(panel.id) ?? { lensType: panel.lens_type }

      return (
        <PanelContainer
          panelId={`${activeWorkspaceId}-${panel.slot_name}`}
          lensType={panel.lens_type}
          dbPanelId={panel.id}
          onRemove={() => handleRemovePanel(panel.id)}
        >
          <LensComponent
            panelId={`${activeWorkspaceId}-${panel.slot_name}`}
            scope={scope}
            config={config}
          />
        </PanelContainer>
      )
    },
    [panels, panelConfigs, lensRegistry, activeWorkspaceId, scope, handleRemovePanel]
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PanelGrid
          items={gridItems}
          onLayoutChange={handleLayoutChange}
          onItemDrop={handleAddPanel}
          renderItem={renderPanel}
          transitioning={transitioning}
        />
      </main>
    </div>
  )
}
