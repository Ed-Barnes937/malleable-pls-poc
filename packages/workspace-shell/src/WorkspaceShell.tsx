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
  useSetWorkspaceScope,
  useServerEvents,
  decodeScope,
  SCOPE_TYPE_BY_DIM,
} from '@pls/substrate-client'
import { useManifests, splitScope, type Scope, type ScopeDim } from '@pls/lens-framework'
import { getAvailableJobTypes } from '@pls/substrate'
import {
  CanvasEngine,
  WorkspaceBackground,
  useCanvasStore,
  findFreeSpot,
  scrollPanelIntoView,
  type PanelItem,
} from '@pls/panel-system'
import { useWorkspaceStore } from './store'
import { getLensComponent, useLensRegistry } from './LensRegistry'
import { PanelContainer } from './PanelContainer'
import { TopBar } from './TopBar'
import { DrawerSidebar } from './DrawerSidebar'
import { LensAutomationsButton } from './LensAutomationsButton'
import { AutomationDialog } from './AutomationDialog'
import { ToastHost, useToastStore } from './toast'
import { usePanelSync, type PanelRow } from './usePanelSync'
import { useWorkspaceBackgroundSync } from './useWorkspaceBackgroundSync'
import { useShowMoment } from './moments'

const JOB_TYPES = new Map(getAvailableJobTypes().map((j) => [j.type, j]))

function jobLabel(jobType?: string): string {
  return (jobType && JOB_TYPES.get(jobType)?.label) || 'Background task'
}

/** What a finished job means for the student; falls back to "Done: <job label>". */
function jobDoneMessage(jobType?: string): string {
  return (jobType && JOB_TYPES.get(jobType)?.doneMessage) || `Done: ${jobLabel(jobType)}`
}

interface PendingAdd {
  workspaceId: string
  box: { x: number; y: number; width: number; height: number; z: number }
  /** Set once saved; the add stops counting as soon as the canvas has this panel. */
  panelId?: string
}

export function WorkspaceShell() {
  const lensRegistry = useLensRegistry()
  const manifests = useManifests()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const focusedMoment = useWorkspaceStore((s) => s.focusedMoment)
  const clearMoment = useWorkspaceStore((s) => s.clearMoment)
  const pushToast = useToastStore((s) => s.push)
  useServerEvents({
    onJobCompleted: (event) => {
      if (event.quiet) return
      pushToast({ message: jobDoneMessage(event.jobType), tone: 'success' })
    },
    // Intermediate attempts retry on their own; only the final failure needs the student.
    onJobFailed: (event) => {
      if (event.willRetry) return
      pushToast({ message: `${jobLabel(event.jobType)} didn't finish - you can retry it from Activity`, tone: 'error' })
    },
  })

  const { data: workspaces } = useWorkspaces()
  const { data: panels } = useWorkspacePanels(activeWorkspaceId)
  const { data: dbScopes } = useWorkspaceScopes(activeWorkspaceId)

  const addPanel = useAddWorkspacePanel()
  const removePanel = useRemoveWorkspacePanel()
  const updateLayouts = useUpdatePanelLayouts()
  const updatePanelConfig = useUpdatePanelConfig()
  const setWorkspaceScope = useSetWorkspaceScope()

  const [transitioning, setTransitioning] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  /** An automation a widget asked to open (`LensProps.onEditAutomation`). */
  const [automationId, setAutomationId] = useState<string | null>(null)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
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

  const handleScopeChange = useCallback(
    (patch: Partial<Scope>) => {
      for (const [dim, value] of Object.entries(patch) as [ScopeDim, string | undefined][]) {
        setWorkspaceScope.mutate({
          workspaceId: activeWorkspaceId,
          scopeType: SCOPE_TYPE_BY_DIM[dim],
          scopeValue: value ?? null,
        })
      }
    },
    [activeWorkspaceId, setWorkspaceScope.mutate],
  )

  const activeLensTypes = useMemo(
    () => (panels as unknown as { lens_type: string }[] | undefined)?.map((p) => p.lens_type) ?? [],
    [panels],
  )
  const handleShowMoment = useShowMoment(activeWorkspaceId, activeLensTypes, manifests)

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

  /**
   * Widgets added but not yet on the canvas: still saving, or saved and
   * waiting for the panel list to refetch. Placement counts them as taken, so
   * quick successive adds don't all pick the same free spot.
   */
  const pendingAddsRef = useRef<PendingAdd[]>([])
  const dropPendingOnCanvas = useCallback(() => {
    const onCanvas = new Set(useCanvasStore.getState().panels.map((p) => p.id))
    pendingAddsRef.current = pendingAddsRef.current.filter((a) => !(a.panelId && onCanvas.has(a.panelId)))
  }, [])
  // Release a spot as soon as its panel first reaches the canvas (usePanelSync,
  // above, has synced this panel list), so removing that panel later frees it.
  useEffect(dropPendingOnCanvas, [panels, dropPendingOnCanvas])

  /**
   * Scrolls the board so a just-added panel is in view, once it reaches the
   * canvas (a full board places new widgets below the fold).
   */
  const revealPanel = useCallback((panelId: string) => {
    let frames = 0
    const tryReveal = () => {
      // The panel list refetches after the save; give it a couple of seconds.
      if (!scrollPanelIntoView(canvasRef.current, panelId) && ++frames < 120) requestAnimationFrame(tryReveal)
    }
    requestAnimationFrame(tryReveal)
  }, [])

  /**
   * Adds a widget at its default size. Without a position (a palette click)
   * it goes in the first free area of the visible board.
   */
  const addWidget = useCallback(
    (lensType: string, at?: { x: number; y: number }) => {
      const m = manifests.find((man) => man.id === lensType)
      const width = m?.defaultWidth ?? 400
      const height = m?.defaultHeight ?? 300
      const existing = useCanvasStore.getState().panels
      const pending = pendingAddsRef.current.filter((a) => a.workspaceId === activeWorkspaceId)
      const taken = [
        ...existing.map((p) => ({ x: p.pos_x, y: p.pos_y, width: p.width, height: p.height, z: p.z_index })),
        ...pending.map((a) => a.box),
      ]
      const canvas = canvasRef.current
      const spot = at ?? findFreeSpot(taken, { width, height }, {
        width: canvas?.clientWidth ?? 0,
        height: canvas?.clientHeight ?? 0,
      })
      const box = {
        x: Math.round(spot.x),
        y: Math.round(spot.y),
        width,
        height,
        z: taken.length > 0 ? Math.max(...taken.map((t) => t.z)) + 1 : 1,
      }
      const add: PendingAdd = { workspaceId: activeWorkspaceId, box }
      pendingAddsRef.current = [...pending, add]

      addPanel.mutate(
        {
          workspaceId: activeWorkspaceId,
          lensType,
          slotName: `slot-${Date.now()}`,
          pos_x: box.x,
          pos_y: box.y,
          width,
          height,
          z_index: box.z,
        },
        {
          onSuccess: (row) => {
            // Stays taken until the canvas shows the saved panel (it may already).
            add.panelId = (row as { id?: string } | undefined)?.id
            dropPendingOnCanvas()
            if (add.panelId && !at) revealPanel(add.panelId)
            // One toast for a run of adds, not a stack of them.
            pushToast({ message: `${m?.label ?? 'Widget'} added`, tone: 'success', key: 'widget-added' })
          },
          onError: () => {
            pendingAddsRef.current = pendingAddsRef.current.filter((a) => a !== add)
            pushToast({ message: `Couldn't add ${m?.label ?? 'the widget'}. Try again.`, tone: 'error' })
          },
        },
      )
    },
    [activeWorkspaceId, addPanel, manifests, pushToast, dropPendingOnCanvas, revealPanel],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const lensType = e.dataTransfer.getData('application/x-lens-type')
      if (!lensType) return

      const m = manifests.find((man) => man.id === lensType)
      const width = m?.defaultWidth ?? 400
      const height = m?.defaultHeight ?? 300

      // Anchor the panel's top-left at the cursor, then clamp within the canvas
      // so it stays fully visible. (Centering on the cursor caused drops near
      // the top/left edge to collapse to 0,0 once the negative result was clamped.)
      // The canvas scrolls down once widgets sit below the fold: drop in content coordinates.
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      const maxX = Math.max(0, rect.width - width)
      const maxY = Math.max(0, Math.max(rect.height, el.scrollHeight) - height)
      addWidget(lensType, {
        x: Math.min(Math.max(0, Math.round(e.clientX - rect.left)), maxX),
        y: Math.min(Math.max(0, Math.round(e.clientY - rect.top + el.scrollTop)), maxY),
      })
    },
    [addWidget, manifests],
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
      // Each widget sees only the dimensions it declares, with highlighted
      // ones kept apart from what its readers may filter by.
      const manifest = manifests.find((m) => m.id === panel.lens_type)
      const panelScope = splitScope(scope, manifest?.scope)

      return (
        <PanelContainer lensType={panel.lens_type} boardId={activeWorkspaceId}>
          <LensComponent
            panelId={`${activeWorkspaceId}-${panel.slot_name}`}
            scope={panelScope.scope}
            highlight={panelScope.highlight}
            config={config}
            onConfigChange={(patch) => updatePanelConfig.mutate({ panelId: panel.id, configPatch: patch })}
            onScopeChange={handleScopeChange}
            onShowMoment={handleShowMoment}
            onEditAutomation={setAutomationId}
            focusedMoment={manifest?.showsMoments ? focusedMoment ?? undefined : undefined}
            onMomentShown={manifest?.showsMoments ? (id) => {
              clearMoment(id)
              // On a full board the widget may sit below the fold: bring it
              // into view so the landed moment is seen.
              scrollPanelIntoView(canvasRef.current, panel.id)
            } : undefined}
          />
        </PanelContainer>
      )
    },
    [panels, panelConfigs, lensRegistry, manifests, activeWorkspaceId, scope, handleRemovePanel, updatePanelConfig, handleScopeChange, handleShowMoment, focusedMoment, clearMoment],
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
        menuOpen={drawerOpen}
        onOrganize={handleOrganize}
      />
      <DrawerSidebar open={drawerOpen} onClose={closeDrawer} onAddWidget={addWidget} />
      <main ref={canvasRef} className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {!panels ? (
          <CanvasSkeleton />
        ) : (
          <div
            className="relative min-h-0 flex-1 transition-opacity duration-150"
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
                  message="This board is empty. Add widgets to build it your way."
                  action={
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="pointer-events-auto mt-1 inline-flex items-center gap-1.5 rounded-[var(--radius-panel)] px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      <Plus size={16} />
                      Add widgets
                    </button>
                  }
                />
              </div>
            )}
          </div>
        )}
      </main>
      {automationId && (
        <AutomationDialog workflowId={automationId} workspaceId={activeWorkspaceId} onClose={() => setAutomationId(null)} />
      )}
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
