import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import {
  useWorkspaces,
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useUpdatePanelLayouts,
  useUpdatePanelConfig,
  useSetBoardScope,
  useServerEvents,
  decodeScope,
  boardScopePatch,
} from '@pls/substrate-client'
import { useManifests, splitScope, type PanelManifest, type PlanItemRef, type Scope } from '@pls/lens-framework'
import { getAvailableJobTypes } from '@pls/substrate'
import {
  CanvasEngine,
  WorkspaceBackground,
  useCanvasStore,
  placeNewPanel,
  scrollPanelIntoView,
  type PanelItem,
} from '@pls/panel-system'
import { useWorkspaceStore } from './store'
import { useActiveWorkspaceId, useKeepActiveBoard } from './activeBoard'
import { NoBoards } from './NoBoards'
import { getLensComponent, useLensRegistry } from './LensRegistry'
import { PanelContainer } from './PanelContainer'
import { TopBar } from './TopBar'
import { DrawerSidebar } from './DrawerSidebar'
import { LensAutomationsButton } from './LensAutomationsButton'
import { AutomationDialog } from './AutomationDialog'
import { ToastHost, useToastStore } from './toast'
import { usePanelSync, type PanelRow } from './usePanelSync'
import { useWorkspaceBackgroundSync } from './useWorkspaceBackgroundSync'
import { hasPlanItemViewer, useShowMoment } from './moments'
import { BoardStarters } from './BoardStarters'
import { listNames } from './starters'

const JOB_TYPES = new Map(getAvailableJobTypes().map((j) => [j.type, j]))

function jobLabel(jobType?: string): string {
  return (jobType && JOB_TYPES.get(jobType)?.label) || 'Background task'
}

/** What a finished job means for the student; falls back to "Done: <job label>". */
function jobDoneMessage(jobType?: string, unplaced?: boolean): string {
  const info = jobType ? JOB_TYPES.get(jobType) : undefined
  return (unplaced && info?.unplacedMessage) || info?.doneMessage || `Done: ${jobLabel(jobType)}`
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
  // Always one of the student's boards, or null (loading, or they have none).
  const activeWorkspaceId = useActiveWorkspaceId()
  useKeepActiveBoard()
  const focusedMoment = useWorkspaceStore((s) => s.focusedMoment)
  const clearMoment = useWorkspaceStore((s) => s.clearMoment)
  const focusedPlanItem = useWorkspaceStore((s) => s.focusedPlanItem)
  const clearPlanItem = useWorkspaceStore((s) => s.clearPlanItem)
  const pushToast = useToastStore((s) => s.push)
  // Read when a job finishes, so the toast offers "See it" only on a board that can show the block.
  const showPlanItemRef = useRef<(item: PlanItemRef) => boolean>(() => false)
  const canShowPlanItemRef = useRef(false)
  const activeBoardRef = useRef(activeWorkspaceId)
  activeBoardRef.current = activeWorkspaceId
  useServerEvents({
    onJobCompleted: (event) => {
      if (event.quiet) return
      const block = event.planItem
      pushToast({
        message: jobDoneMessage(event.jobType, event.unplaced),
        tone: 'success',
        // "See it" reveals the block on the board in view, so it goes if the student leaves it.
        ...(block && canShowPlanItemRef.current
          ? { action: { label: 'See it', onClick: () => showPlanItemRef.current(block) }, board: activeBoardRef.current ?? undefined }
          : {}),
      })
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
  const setBoardScope = useSetBoardScope()

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

  // One atomic write per patch, whatever it touches: the server keeps the
  // lecture inside the course (see `setBoardScope`).
  // Resolves to whether it was written; never rejects.
  const handleScopeChange = useCallback(
    (patch: Partial<Scope>): Promise<boolean> => {
      if (!activeWorkspaceId) return Promise.resolve(false)
      return setBoardScope
        .mutateAsync({ workspaceId: activeWorkspaceId, ...boardScopePatch(patch) })
        .then(() => true, () => false)
    },
    [activeWorkspaceId, setBoardScope.mutateAsync],
  )

  const activeLensTypes = useMemo(
    () => (panels as unknown as { lens_type: string }[] | undefined)?.map((p) => p.lens_type) ?? [],
    [panels],
  )
  const handleShowMoment = useShowMoment(activeWorkspaceId, activeLensTypes, manifests)
  const focusPlanItem = useWorkspaceStore((s) => s.focusPlanItem)
  const canShowPlanItem = hasPlanItemViewer(activeLensTypes, manifests)
  const handleShowPlanItem = useCallback(
    (item: PlanItemRef) => {
      if (!canShowPlanItem) return false
      focusPlanItem(item)
      return true
    },
    [canShowPlanItem, focusPlanItem],
  )
  showPlanItemRef.current = handleShowPlanItem
  canShowPlanItemRef.current = canShowPlanItem

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
   * quick successive adds don't all pick the same free spot. Read from the
   * ref (current even between renders); the state copy re-renders the board,
   * whose first-run starters stay away while an add is on its way.
   */
  const pendingAddsRef = useRef<PendingAdd[]>([])
  const [pendingAdds, setPendingAddsState] = useState<PendingAdd[]>([])
  const setPendingAdds = useCallback((next: PendingAdd[]) => {
    pendingAddsRef.current = next
    setPendingAddsState(next)
  }, [])
  const dropPendingOnCanvas = useCallback(() => {
    const onCanvas = new Set(useCanvasStore.getState().panels.map((p) => p.id))
    const next = pendingAddsRef.current.filter((a) => !(a.panelId && onCanvas.has(a.panelId)))
    if (next.length !== pendingAddsRef.current.length) setPendingAdds(next)
  }, [setPendingAdds])
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
   * it goes in the first free area of the visible board, shortened (down to
   * its minimum height) when that keeps it in view next to the widgets already
   * there on the desktop layout (see placeNewPanel). A drop (`at`) keeps its
   * default height. `quiet` skips the
   * scroll into view and the toasts, for a caller adding a group of widgets
   * to an empty board and announcing the outcome itself (`onSettled`).
   */
  const addWidget = useCallback(
    (lensType: string, at?: { x: number; y: number }, opts: { quiet?: boolean; onSettled?: (ok: boolean) => void } = {}) => {
      // No board, nothing to add to: the menu and the board offer a new board instead.
      if (!activeWorkspaceId) return
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
      // A click places it in view, on the desktop layout a little shorter if that is what fits (see placeNewPanel).
      const spot = at ? { ...at, height } : placeNewPanel(taken, { width, height, minHeight: m?.minHeight }, {
        width: canvas?.clientWidth ?? 0,
        height: canvas?.clientHeight ?? 0,
      })
      const box = {
        x: Math.round(spot.x),
        y: Math.round(spot.y),
        width,
        height: spot.height,
        z: taken.length > 0 ? Math.max(...taken.map((t) => t.z)) + 1 : 1,
      }
      const add: PendingAdd = { workspaceId: activeWorkspaceId, box }
      setPendingAdds([...pendingAddsRef.current, add])

      // mutateAsync, not mutate with callbacks: mutate's callbacks fire only
      // for the latest of several overlapping calls, and every add needs its own.
      addPanel.mutateAsync({
        workspaceId: activeWorkspaceId,
        lensType,
        slotName: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pos_x: box.x,
        pos_y: box.y,
        width,
        height: box.height,
        z_index: box.z,
      }).then(
        (row) => {
          // Stays taken until the canvas shows the saved panel (it may already).
          add.panelId = (row as { id?: string } | undefined)?.id
          dropPendingOnCanvas()
          if (add.panelId && !at && !opts.quiet) revealPanel(add.panelId)
          opts.onSettled?.(true)
          // One toast for a run of adds, not a stack of them.
          if (!opts.quiet) pushToast({ message: `${m?.label ?? 'Widget'} added`, tone: 'success', key: 'widget-added' })
        },
        () => {
          setPendingAdds(pendingAddsRef.current.filter((a) => a !== add))
          opts.onSettled?.(false)
          if (!opts.quiet) pushToast({ message: `Couldn't add ${m?.label ?? 'the widget'}. Try again.`, tone: 'error' })
        },
      )
    },
    [activeWorkspaceId, addPanel, manifests, pushToast, dropPendingOnCanvas, revealPanel, setPendingAdds],
  )

  /**
   * A first-run starter: its widgets, placed one after another by the same
   * click-to-add placement (largest first), with one toast once all have
   * settled: what was added, or what couldn't be (the adds share one request,
   * so they usually fail together).
   */
  const addStarter = useCallback(
    (widgets: PanelManifest[]) => {
      const added: string[] = []
      const failed: string[] = []
      const onSettled = (label: string) => (ok: boolean) => {
        ;(ok ? added : failed).push(label)
        if (added.length + failed.length < widgets.length) return
        const names = (list: string[]) => listNames(widgets.map((w) => w.label).filter((l) => list.includes(l)))
        if (failed.length > 0) pushToast({ message: `Couldn't add ${names(failed)}. Try again.`, tone: 'error' })
        else pushToast({ message: `${names(added)} added`, tone: 'success', key: 'widget-added' })
      }
      for (const w of widgets) addWidget(w.id, undefined, { quiet: true, onSettled: onSettled(w.label) })
    },
    [addWidget, pushToast],
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
      if (!panel || !activeWorkspaceId) return null
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
            onShowPlanItem={canShowPlanItem ? handleShowPlanItem : undefined}
            focusedPlanItem={manifest?.showsPlanItems ? focusedPlanItem ?? undefined : undefined}
            // The viewer brings the block itself into view on the board
            // (not the whole widget), so it is not scrolled here.
            onPlanItemShown={manifest?.showsPlanItems ? clearPlanItem : undefined}
          />
        </PanelContainer>
      )
    },
    [panels, panelConfigs, lensRegistry, manifests, activeWorkspaceId, scope, handleRemovePanel, updatePanelConfig, handleScopeChange, handleShowMoment, focusedMoment, clearMoment, handleShowPlanItem, focusedPlanItem, clearPlanItem],
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
      if (!panel || !activeWorkspaceId) return null
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
        onOrganize={activeWorkspaceId ? handleOrganize : undefined}
      />
      <DrawerSidebar open={drawerOpen} onClose={closeDrawer} onAddWidget={addWidget} />
      <main ref={canvasRef} className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {workspaces?.length === 0 ? (
          <NoBoards />
        ) : !panels ? (
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
            {/* No starters while an add is on its way, or a starter could add a second Calendar. */}
            {panels.length === 0 && !pendingAdds.some((a) => a.workspaceId === activeWorkspaceId) && (
              <div
                data-testid="workspace-empty-state"
                className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center"
              >
                <BoardStarters
                  manifests={manifests}
                  onStart={addStarter}
                  onAddWidgets={() => setDrawerOpen(true)}
                />
              </div>
            )}
          </div>
        )}
      </main>
      {automationId && activeWorkspaceId && (
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
          className="flex h-48 w-72 flex-col gap-3 rounded-widget border border-border-subtle bg-surface-raised p-4"
          style={{ opacity: 1 - i * 0.2 }}
        >
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-surface-overlay" />
          <div className="h-3 w-full animate-pulse rounded-full bg-surface-overlay/80" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-surface-overlay/60" />
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-surface-overlay/40" />
        </div>
      ))}
    </div>
  )
}
