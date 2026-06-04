import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { LayoutGrid, Plus } from 'lucide-react'
import { EmptyState } from '@pls/shared-ui'
import {
  useWorkspaces,
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useUpdatePanelLayouts,
  useUpdatePanelConfig,
  useServerEvents,
  decodeScope,
} from '@pls/substrate-client'
import { useManifests } from '@pls/lens-framework'
import { getAvailableJobTypes } from '@pls/substrate'
import {
  CanvasEngine,
  WorkspaceBackground,
  useCanvasStore,
  type PanelItem,
} from '@pls/panel-system'
import { useWorkspaceStore } from './store'
import { getLensComponent, useLensRegistry } from './LensRegistry'
import { PanelContainer } from './PanelContainer'
import { TopBar } from './TopBar'
import { DrawerSidebar } from './DrawerSidebar'
import { LensAutomationsButton } from './LensAutomationsButton'
import { ToastHost, useToastStore } from './toast'
import { usePanelSync, type PanelRow } from './usePanelSync'
import { useWorkspaceBackgroundSync } from './useWorkspaceBackgroundSync'

const JOB_LABELS: Record<string, string> = Object.fromEntries(
  getAvailableJobTypes().map((j) => [j.type, j.label]),
)

function jobLabel(jobType?: string): string {
  return (jobType && JOB_LABELS[jobType]) || 'Job'
}

export function WorkspaceShell() {
  const lensRegistry = useLensRegistry()
  const manifests = useManifests()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const pushToast = useToastStore((s) => s.push)
  useServerEvents({
    onJobCompleted: (event) => pushToast({ message: `${jobLabel(event.jobType)} completed`, tone: 'success' }),
    onJobFailed: (event) => pushToast({ message: `${jobLabel(event.jobType)} failed`, tone: 'error' }),
  })

  const { data: workspaces } = useWorkspaces()
  const { data: panels } = useWorkspacePanels(activeWorkspaceId)
  const { data: dbScopes } = useWorkspaceScopes(activeWorkspaceId)

  const addPanel = useAddWorkspacePanel()
  const removePanel = useRemoveWorkspacePanel()
  const updateLayouts = useUpdatePanelLayouts()
  const updatePanelConfig = useUpdatePanelConfig()

  const [transitioning, setTransitioning] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const prevWorkspaceRef = useRef(activeWorkspaceId)
  const canvasRef = useRef<HTMLDivElement>(null)

  usePanelSync(activeWorkspaceId, panels as unknown as PanelRow[] | undefined, manifests, canvasRef)
  useWorkspaceBackgroundSync(activeWorkspaceId, workspaces)

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
    () => decodeScope((dbScopes ?? []) as { scope_type: string; scope_value: string }[]),
    [dbScopes],
  )

  const panelConfigs = useMemo(() => {
    if (!panels) return new Map<string, Record<string, unknown>>()
    const map = new Map<string, Record<string, unknown>>()
    for (const p of panels as unknown as { id: string; config: Record<string, unknown>; lens_type: string }[]) {
      map.set(p.id, { ...p.config, lensType: p.lens_type })
    }
    return map
  }, [panels])

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
      // Anchor the panel's top-left at the cursor, then clamp within the canvas
      // so it stays fully visible. (Centering on the cursor caused drops near
      // the top/left edge to collapse to 0,0 once the negative result was clamped.)
      const rect = e.currentTarget.getBoundingClientRect()
      const maxX = Math.max(0, rect.width - width)
      const maxY = Math.max(0, rect.height - height)
      const pos_x = Math.min(Math.max(0, Math.round(e.clientX - rect.left)), maxX)
      const pos_y = Math.min(Math.max(0, Math.round(e.clientY - rect.top)), maxY)

      addPanel.mutate({
        workspaceId: activeWorkspaceId,
        lensType,
        slotName,
        pos_x,
        pos_y,
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
        <PanelContainer lensType={panel.lens_type}>
          <LensComponent
            panelId={`${activeWorkspaceId}-${panel.slot_name}`}
            scope={scope}
            config={config}
            onConfigChange={(patch) => updatePanelConfig.mutate({ panelId: panel.id, configPatch: patch })}
          />
        </PanelContainer>
      )
    },
    [panels, panelConfigs, lensRegistry, activeWorkspaceId, scope, handleRemovePanel, updatePanelConfig],
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

  // Per-panel header actions — currently just the Lens Automations button
  const renderHeaderActions = useCallback(
    (panelId: string) => {
      const panel = panels?.find((p) => p.id === panelId)
      if (!panel) return null
      return (
        <LensAutomationsButton
          panelId={panel.id}
          lensType={panel.lens_type}
          workspaceId={activeWorkspaceId}
        />
      )
    },
    [panels, activeWorkspaceId],
  )

  // Auto-organize panels into a tidy grid
  const handleOrganize = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const { organizePanels } = useCanvasStore.getState()
    organizePanels(el.clientWidth, el.clientHeight)
    // Persist the new layout to DB
    const updated = useCanvasStore.getState().panels
    handleLayoutChange(updated)
  }, [handleLayoutChange])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface">
      <TopBar
        onMenuClick={() => setDrawerOpen((v) => !v)}
        onOrganize={handleOrganize}
      />
      <DrawerSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main ref={canvasRef} className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
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
              onRemovePanel={handleRemovePanel}
              renderPanel={renderPanel}
              getIcon={getIcon}
              getLabel={getLabel}
              renderHeaderActions={renderHeaderActions}
            />
            {panels.length === 0 && (
              <div
                data-testid="workspace-empty-state"
                className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center"
              >
                <EmptyState
                  icon={LayoutGrid}
                  message="This workspace is empty. Add a lens to get started."
                  action={
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="pointer-events-auto mt-1 inline-flex items-center gap-1.5 rounded-[var(--radius-panel)] px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      <Plus size={16} />
                      Add lenses
                    </button>
                  }
                />
              </div>
            )}
          </div>
        )}
      </main>
      <ToastHost />
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
