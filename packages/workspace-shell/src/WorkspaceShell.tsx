import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import {
  useWorkspaces,
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useUpdatePanelLayouts,
  useUpdateWorkspaceBackground,
  useServerEvents,
} from '@pls/substrate-client'
import type { Scope } from '@pls/lens-framework'
import { useManifests } from '@pls/lens-framework'
import {
  CanvasEngine,
  WorkspaceBackground,
  useCanvasStore,
  type PanelItem,
} from '@pls/panel-system'
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
  const manifests = useManifests()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  useServerEvents()

  const { data: workspaces } = useWorkspaces()
  const { data: panels } = useWorkspacePanels(activeWorkspaceId)
  const { data: dbScopes } = useWorkspaceScopes(activeWorkspaceId)

  const addPanel = useAddWorkspacePanel()
  const removePanel = useRemoveWorkspacePanel()
  const updateLayouts = useUpdatePanelLayouts()
  const updateBackground = useUpdateWorkspaceBackground()

  const setPanels = useCanvasStore((s) => s.setPanels)
  const setBackground = useCanvasStore((s) => s.setBackground)

  const [transitioning, setTransitioning] = useState(false)
  const prevWorkspaceRef = useRef(activeWorkspaceId)

  // Workspace transition animation
  useEffect(() => {
    if (prevWorkspaceRef.current !== activeWorkspaceId) {
      setTransitioning(true)
      const timer = setTimeout(() => setTransitioning(false), 150)
      prevWorkspaceRef.current = activeWorkspaceId
      return () => clearTimeout(timer)
    }
  }, [activeWorkspaceId])

  const scope = useMemo(
    () => scopesFromDb((dbScopes ?? []) as { scope_type: string; scope_value: string }[]),
    [dbScopes],
  )

  const panelConfigs = useMemo(() => {
    if (!panels) return new Map<string, Record<string, unknown>>()
    const map = new Map<string, Record<string, unknown>>()
    for (const p of panels as unknown as { id: string; config: Record<string, unknown> | string; lens_type: string }[]) {
      const cfg = typeof p.config === 'string' ? JSON.parse(p.config) : p.config
      map.set(p.id, { ...cfg, lensType: p.lens_type })
    }
    return map
  }, [panels])

  // Sync DB panels to canvas store whenever the server data changes
  const prevPanelDataRef = useRef<typeof panels>(null)
  useEffect(() => {
    if (!panels || panels === prevPanelDataRef.current) return
    prevPanelDataRef.current = panels

    const canvasPanels: PanelItem[] = panels.map((p) => {
      const m = manifests.find((man) => man.id === p.lens_type)
      return {
        id: p.id,
        pos_x: p.pos_x,
        pos_y: p.pos_y,
        width: p.width,
        height: p.height,
        z_index: p.z_index,
        title: undefined, // Resolved from manifest at render time
        lensType: p.lens_type,
        constraints: m
          ? {
              minWidth: m.minWidth,
              minHeight: m.minHeight,
              maxWidth: m.maxWidth,
              maxHeight: m.maxHeight,
            }
          : undefined,
      }
    })
    setPanels(canvasPanels)
  }, [panels, setPanels, manifests])

  // Sync workspace background to canvas store
  useEffect(() => {
    if (!workspaces) return
    const wsList = workspaces as unknown as { id: string; background_type?: string; background_value?: string }[]
    const ws = wsList.find((w) => w.id === activeWorkspaceId)
    if (ws?.background_type && ws.background_type !== 'none') {
      setBackground({
        type: ws.background_type as 'solid' | 'gradient' | 'image',
        value: ws.background_value ?? '',
      })
    } else {
      setBackground({ type: 'none', value: '' })
    }
  }, [workspaces, activeWorkspaceId, setBackground])

  // Persist canvas store background changes to DB
  const prevBgRef = useRef<string>('')
  const background = useCanvasStore((s) => s.background)
  useEffect(() => {
    const key = `${background.type}:${background.value}`
    if (key === prevBgRef.current) return
    // Skip the initial sync from DB
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

  // Persist layout changes from canvas store to DB
  const handleLayoutChange = useCallback(
    (canvasPanels: PanelItem[]) => {
      if (!panels?.length) return
      updateLayouts.mutate(
        canvasPanels.map((p) => ({
          id: p.id,
          pos_x: Math.round(p.pos_x),
          pos_y: Math.round(p.pos_y),
          width: Math.round(p.width),
          height: Math.round(p.height),
          z_index: p.z_index,
        })),
      )
    },
    [panels, updateLayouts],
  )

  // Handle DnD from sidebar lens palette
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-lens-type')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const lensType = e.dataTransfer.getData('application/x-lens-type')
      if (!lensType) return

      const m = manifests.find((man) => man.id === lensType)
      const width = m?.defaultWidth ?? 400
      const height = m?.defaultHeight ?? 300

      const slotName = `slot-${Date.now()}`
      // Calculate drop position relative to the canvas
      const rect = e.currentTarget.getBoundingClientRect()
      const pos_x = Math.round(e.clientX - rect.left - width / 2)
      const pos_y = Math.round(e.clientY - rect.top - height / 2)

      addPanel.mutate({
        workspaceId: activeWorkspaceId,
        lensType,
        slotName,
        pos_x: Math.max(0, pos_x),
        pos_y: Math.max(0, pos_y),
        width,
        height,
        z_index: (useCanvasStore.getState().panels.length > 0
          ? Math.max(...useCanvasStore.getState().panels.map((p) => p.z_index)) + 1
          : 1),
      })
    },
    [activeWorkspaceId, addPanel, manifests],
  )

  // Handle panel removal — remove from DB then let query invalidation update canvas store
  const handleRemovePanel = useCallback(
    (panelId: string) => {
      // Also remove from canvas store immediately for snappy UX
      useCanvasStore.getState().removePanel(panelId)
      removePanel.mutate(panelId)
    },
    [removePanel],
  )

  // Render lens content for a given panel
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
    [panels, panelConfigs, lensRegistry, activeWorkspaceId, scope, handleRemovePanel],
  )

  // Icon resolver: look up icon from the manifest registry
  const getIcon = useCallback(
    (lensType: string) => {
      const manifest = manifests.find((m) => m.id === lensType)
      return manifest?.icon
    },
    [manifests],
  )

  // Label resolver: look up label from the manifest registry
  const getLabel = useCallback(
    (lensType: string) => {
      const manifest = manifests.find((m) => m.id === lensType)
      return manifest?.label
    },
    [manifests],
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {!panels ? (
          <CanvasSkeleton />
        ) : (
          <div
            className="relative flex-1 transition-opacity duration-150"
            style={{ opacity: transitioning ? 0 : 1 }}
          >
            <WorkspaceBackground />
            <CanvasEngine
              onLayoutChange={handleLayoutChange}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              renderPanel={renderPanel}
              getIcon={getIcon}
              getLabel={getLabel}
            />
          </div>
        )}
      </main>
    </div>
  )
}

function CanvasSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center gap-6 p-6">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex h-48 w-72 flex-col gap-3 rounded-[var(--radius-panel)] border border-border-subtle bg-surface-raised p-4"
          style={{ opacity: 1 - i * 0.2 }}
        >
          <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-800" />
          <div className="h-3 w-full animate-pulse rounded bg-neutral-800/60" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-800/40" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-800/30" />
        </div>
      ))}
    </div>
  )
}
