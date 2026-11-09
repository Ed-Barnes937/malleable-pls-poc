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
import { requestHelpMePlan, useManifests, splitScope, type PanelManifest, type LensNotice, type PlanItemRef, type ReviewMoment, type Scope } from '@pls/lens-framework'
import { getAvailableJobTypes } from '@pls/substrate'
import {
  CanvasEngine,
  WorkspaceBackground,
  useCanvasStore,
  placeNewPanel,
  layoutGroup,
  persistableLayout,
  scrollPanelIntoView,
  tidyLayout,
  STACK_BREAKPOINT,
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
import { ToastHost, notifyToast, pushUndoToast, useToastStore } from './toast'
import { usePanelSync } from './usePanelSync'
import { useWorkspaceBackgroundSync } from './useWorkspaceBackgroundSync'
import { hasPlanItemViewer, missedBlocksHost, useShowMoment } from './moments'
import { useRevealPlanItem } from './reveal-plan-item'
import { useFocusClass, useLectureBoards, useOpenLectureOn, useUndoFocusClass } from './class-focus'
import { BoardStarters } from './BoardStarters'
import { listNames } from './starters'

/** Tidy up's toast: one at a time, and gone once a widget is added or removed. */
const TIDY_UP_TOAST = 'tidy-up'

/** The board's widgets, whatever their order: tells an add or remove from a move. */
function idsOf(panels: ReadonlyArray<PanelItem>): string {
  return panels.map((p) => p.id).sort().join(' ')
}

/** Where each widget is and how big, whatever their order or stacking. */
function placesOf(panels: ReadonlyArray<PanelItem>): string {
  return panels.map((p) => `${p.id}:${Math.round(p.pos_x)},${Math.round(p.pos_y)},${Math.round(p.width)}x${Math.round(p.height)}`).sort().join(' ')
}

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
  // Only if the block is still there by the time "See it" is pressed.
  const revealPlanItem = useRevealPlanItem(useCallback((item: PlanItemRef) => showPlanItemRef.current(item), []))
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
          ? { action: { label: 'See it', onClick: () => void revealPlanItem(block) }, board: activeBoardRef.current ?? undefined }
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

  const [drawerOpen, setDrawerOpen] = useState(false)
  /** An automation a widget asked to open (`LensProps.onEditAutomation`). */
  const [automationId, setAutomationId] = useState<string | null>(null)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const canvasRef = useRef<HTMLDivElement>(null)

  /** The board whose widgets the canvas holds (the last board's, until a new one's arrive). */
  const canvasBoard = usePanelSync(activeWorkspaceId, panels, manifests, canvasRef)
  const canvasBoardRef = useRef(canvasBoard)
  canvasBoardRef.current = canvasBoard
  useWorkspaceBackgroundSync(activeWorkspaceId, workspaces)
  const slideFrom = useBoardSlide(activeWorkspaceId, workspaces as unknown as { id: string }[] | undefined)

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
    () => panels?.map((p) => p.lens_type) ?? [],
    [panels],
  )
  const handleShowMoment = useShowMoment(activeWorkspaceId, activeLensTypes, manifests)
  // A calendar class focuses its lecture here; "Also open in" lists the other
  // boards that can show it, found by what they contain.
  const handleFocusClass = useFocusClass(activeWorkspaceId)
  const handleUndoFocusClass = useUndoFocusClass(activeWorkspaceId)
  const { lectureBoards, boardShowsLectures, summary: boardSummary } = useLectureBoards(activeWorkspaceId, activeLensTypes, manifests)
  const handleOpenLectureOn = useOpenLectureOn(activeWorkspaceId, boardSummary)
  const openWidgetPalette = useCallback(() => setDrawerOpen(true), [])
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
    for (const p of panels) {
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

  /** Adds asked for while the board's widgets were still loading, made once they have reached the canvas. */
  const [waitingAdds, setWaitingAdds] = useState<{ workspaceId: string; add: () => void }[]>([])
  useEffect(() => {
    if (!activeWorkspaceId || canvasBoard !== activeWorkspaceId || waitingAdds.length === 0) return
    setWaitingAdds([])
    // Adds for a board the student has since left are dropped.
    for (const a of waitingAdds) if (a.workspaceId === activeWorkspaceId) a.add()
  }, [activeWorkspaceId, canvasBoard, waitingAdds])

  /**
   * Adds a widget at its default size. Without a position (a palette click)
   * it goes in the first free area of the visible board, shortened (down to
   * its minimum height) when that keeps it in view next to the widgets already
   * there on the desktop layout (see placeNewPanel). A drop (`at`) keeps its
   * default size, unless `at` gives one (a starter's group layout). `quiet`
   * skips the scroll into view and the toasts, for a caller adding a group of
   * widgets to an empty board and announcing the outcome itself (`onSettled`).
   */
  const addWidget = useCallback(
    (
      lensType: string,
      at?: { x: number; y: number; width?: number; height?: number },
      opts: { quiet?: boolean; slotName?: string; onSettled?: (ok: boolean, panelId?: string) => void } = {},
    ) => {
      // No board, nothing to add to: the menu and the board offer a new board instead.
      if (!activeWorkspaceId) return
      // Placed among this board's widgets, never the last board's: an add asked
      // for before they reach the canvas waits for them.
      if (canvasBoardRef.current !== activeWorkspaceId) {
        const workspaceId = activeWorkspaceId
        setWaitingAdds((waiting) => [...waiting, { workspaceId, add: () => addWidgetRef.current(lensType, at, opts) }])
        return
      }
      const m = manifests.find((man) => man.id === lensType)
      const width = at?.width ?? m?.defaultWidth ?? 400
      const height = at?.height ?? m?.defaultHeight ?? 300
      const existing = useCanvasStore.getState().panels
      const pending = pendingAddsRef.current.filter((a) => a.workspaceId === activeWorkspaceId)
      const taken = [
        ...existing.map((p) => ({ x: p.pos_x, y: p.pos_y, width: p.width, height: p.height, z: p.z_index })),
        ...pending.map((a) => a.box),
      ]
      const canvas = canvasRef.current
      // A click places it in view, on the desktop layout a little shorter if that is what fits (see placeNewPanel).
      const spot = at ? { x: at.x, y: at.y, height } : placeNewPanel(taken, { width, height, minHeight: m?.minHeight }, {
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
        slotName: opts.slotName ?? `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
          opts.onSettled?.(true, add.panelId)
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
  const addWidgetRef = useRef(addWidget)
  addWidgetRef.current = addWidget

  /**
   * A first-run starter: its widgets, laid out as a group to fit the visible
   * board (see layoutGroup) and saved one by one through the same add path,
   * with one toast once all have settled: what was added, or what couldn't be
   * (the adds share one request, so they usually fail together). The layout
   * is the student's from then on: nothing reflows it when the window resizes.
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
      const canvas = canvasRef.current
      const boxes = layoutGroup(
        widgets.map((w) => ({
          width: w.defaultWidth ?? 400,
          height: w.defaultHeight ?? 300,
          minWidth: w.minWidth,
          minHeight: w.minHeight,
          maxWidth: w.maxWidth,
          maxHeight: w.maxHeight,
        })),
        { width: canvas?.clientWidth ?? 0, height: canvas?.clientHeight ?? 0 },
        { scrollbarWidth: scrollbarWidth() },
      )
      widgets.forEach((w, i) => addWidget(w.id, boxes[i], { quiet: true, onSettled: onSettled(w.label) }))
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

  /**
   * Config changes sent but not in `panels` yet (it is read again once each
   * is saved): with `panels`, each widget's settings as they are now.
   */
  const unsavedConfig = useRef(new Map<string, Record<string, unknown>>())
  const changePanelConfig = useCallback((panelId: string, patch: Record<string, unknown>) => {
    const merged = { ...unsavedConfig.current.get(panelId), ...patch }
    unsavedConfig.current.set(panelId, merged)
    updatePanelConfig.mutate({ panelId, configPatch: patch }, {
      // Saved and read again (or failed): `panels` has it, unless a newer change is still on its way.
      onSettled: () => {
        if (unsavedConfig.current.get(panelId) === merged) unsavedConfig.current.delete(panelId)
      },
    })
  }, [updatePanelConfig])

  // Handle panel removal — remove from DB then let query invalidation update canvas store
  const handleRemovePanel = useCallback(
    (panelId: string) => {
      // Undo puts the widget back where it was, with its settings as they
      // are now. A run of removes is one toast; its Undo brings back the last one.
      const row = panels?.find((p) => p.id === panelId)
      const box = useCanvasStore.getState().panels.find((p) => p.id === panelId)
      const boardId = activeWorkspaceId
      if (row && box && boardId) {
        const label = manifests.find((m) => m.id === row.lens_type)?.label ?? 'Widget'
        pushUndoToast({
          key: 'widget-removed',
          message: `${label} removed`,
          failMessage: `Couldn't put ${label} back. Add it again from the widget menu.`,
          undo: () => addPanel.mutateAsync({
            workspaceId: boardId,
            lensType: row.lens_type,
            slotName: row.slot_name,
            config: { ...row.config, ...unsavedConfig.current.get(panelId) },
            pos_x: Math.round(box.pos_x),
            pos_y: Math.round(box.pos_y),
            width: Math.round(box.width),
            height: Math.round(box.height),
            z_index: box.z_index,
          }),
        }, { board: boardId })
      }
      // Also remove from canvas store immediately for snappy UX
      useCanvasStore.getState().removePanel(panelId)
      removePanel.mutate(panelId)
    },
    [removePanel, addPanel, panels, activeWorkspaceId, manifests],
  )

  // A board asks about blocks that didn't happen once (decision 4).
  const missedBlocksPanel = useMemo(
    () => missedBlocksHost(panels ?? [], manifests),
    [panels, manifests],
  )

  const startReview = useWorkspaceStore((s) => s.startReview)
  const clearReview = useWorkspaceStore((s) => s.clearReview)
  const reviewRun = useWorkspaceStore((s) => s.reviewRun)
  const dismissToastKey = useToastStore((s) => s.dismissKey)
  const handleNotify = useCallback(
    (notice: LensNotice) => notifyToast(notice),
    [],
  )
  /**
   * A focused review on this board: handed to its Test Me (brought into
   * view), or, when it has none, to one added for it, with Undo. Never
   * switches boards.
   */
  const handleStartReview = useCallback(
    (moments: ReviewMoment[]) => {
      // The canvas, not the panel list: a widget just removed leaves the canvas
      // at once, but the list until it refetches.
      const reviewer = useCanvasStore.getState().panels
        .find((p) => manifests.find((m) => m.id === p.lensType)?.runsReviews)
      if (reviewer) {
        startReview(moments, reviewer.id)
        revealPanel(reviewer.id)
        return
      }
      const lensType = manifests.find((m) => m.runsReviews)?.id
      if (!lensType) return
      const label = manifests.find((m) => m.id === lensType)?.label ?? 'Test Me'
      addWidget(lensType, undefined, {
        quiet: true,
        onSettled: (ok, panelId) => {
          if (!ok) {
            pushToast({ message: `Couldn't add ${label}. Try again.`, tone: 'error' })
            return
          }
          if (!panelId) return
          startReview(moments, panelId)
          revealPanel(panelId)
          pushToast({
            message: `${label} added to review your moments`,
            tone: 'success',
            key: 'widget-added',
            action: { label: 'Undo', onClick: () => handleRemovePanel(panelId) },
          })
        },
      })
    },
    [manifests, startReview, revealPanel, addWidget, pushToast, handleRemovePanel],
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
            onConfigChange={(patch) => changePanelConfig(panel.id, patch)}
            onScopeChange={handleScopeChange}
            onShowMoment={handleShowMoment}
            onFocusClass={handleFocusClass}
            onUndoFocusClass={handleUndoFocusClass}
            lectureBoards={lectureBoards}
            boardShowsLectures={boardShowsLectures}
            onOpenLectureOn={handleOpenLectureOn}
            onAddWidget={openWidgetPalette}
            onEditAutomation={setAutomationId}
            onNotify={handleNotify}
            onDismissNotice={dismissToastKey}
            onStartReview={handleStartReview}
            // Only the widget the run was handed to takes it (the first on the canvas).
            reviewRun={manifest?.runsReviews && reviewRun && reviewRun.panelId === panel.id ? reviewRun : undefined}
            onReviewStarted={manifest?.runsReviews ? clearReview : undefined}
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
            asksAboutMissedBlocks={missedBlocksPanel === panel.id}
          />
        </PanelContainer>
      )
    },
    [panels, panelConfigs, lensRegistry, manifests, activeWorkspaceId, scope, handleRemovePanel, changePanelConfig, handleScopeChange, handleShowMoment, handleFocusClass, handleUndoFocusClass, lectureBoards, boardShowsLectures, handleOpenLectureOn, openWidgetPalette, focusedMoment, clearMoment, handleShowPlanItem, focusedPlanItem, clearPlanItem, handleNotify, dismissToastKey, handleStartReview, reviewRun, clearReview, missedBlocksPanel],
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

  // Tidy up fills the board's area, the Calendar leading (see tidyLayout); the
  // canvas glides the widgets there and saves the ones that moved. Undo puts
  // the layout from before back (and saves it), until a widget is added,
  // removed, moved or resized. Only on the desktop layout: a phone stacks the
  // widgets anyway.
  const handleOrganize = useCallback(() => {
    const el = canvasRef.current
    const boardId = activeWorkspaceId
    if (!el || !boardId || el.clientWidth < STACK_BREAKPOINT) return
    const store = useCanvasStore.getState()
    const before = new Map(persistableLayout(store).map((p) => [p.id, { pos_x: p.pos_x, pos_y: p.pos_y, width: p.width, height: p.height, z_index: p.z_index }]))
    if (store.fullscreenPanelId) store.exitFullscreen()
    const tidied = useCanvasStore.getState().panels
    useCanvasStore.getState().arrangePanels(tidyLayout(tidied, { width: el.clientWidth, height: el.clientHeight }))
    // Already tidy: nothing moved, so nothing to undo.
    if (useCanvasStore.getState().panels === tidied) return
    const ids = idsOf(useCanvasStore.getState().panels)
    pushUndoToast({
      key: TIDY_UP_TOAST,
      message: 'Widgets tidied up',
      undo: async () => {
        if (idsOf(useCanvasStore.getState().panels) !== ids) throw new Error('The widgets on the board changed')
        useCanvasStore.getState().arrangePanels(before)
      },
      failMessage: "Couldn't undo Tidy up: the widgets on the board have changed.",
    }, { board: boardId })
  }, [activeWorkspaceId])

  // Tidy up's Undo stops being offered once a widget is added, removed,
  // moved or resized (decision 34). Raising one, or going fullscreen, isn't
  // a change to the layout.
  useEffect(() => useCanvasStore.subscribe((state, prev) => {
    if (state.panels === prev.panels && state.fullscreenPanelId === prev.fullscreenPanelId) return
    if (placesOf(persistableLayout(state)) !== placesOf(persistableLayout(prev))) {
      useToastStore.getState().dismissKey(TIDY_UP_TOAST)
    }
  }), [])

  // The top bar's Up next: plan the week on this board, never switching boards.
  // The Calendar that opens Help me plan is named by its panelId (the board and
  // slot), so a board switch or a second press can't send it elsewhere.
  const calendarPanel = panels?.find((p) => p.lens_type === 'calendar')
  const boardHasCalendar = !!calendarPanel
  /** A Calendar being added here: a second press waits for it instead of adding another. */
  const calendarAdd = useRef<{ workspaceId: string; plan: boolean } | null>(null)
  const addCalendar = useCallback(
    (plan: boolean) => {
      if (!activeWorkspaceId) return
      const inFlight = calendarAdd.current
      if (inFlight?.workspaceId === activeWorkspaceId) {
        inFlight.plan ||= plan
        return
      }
      const job = { workspaceId: activeWorkspaceId, plan }
      calendarAdd.current = job
      const slotName = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      addWidget('calendar', undefined, {
        slotName,
        // Asked only once the Calendar is there, so a failed add asks nothing.
        onSettled: (ok) => {
          if (calendarAdd.current === job) calendarAdd.current = null
          if (ok && job.plan) requestHelpMePlan(`${job.workspaceId}-${slotName}`)
        },
      })
    },
    [activeWorkspaceId, addWidget],
  )
  const handleAddCalendar = useCallback(() => addCalendar(false), [addCalendar])
  const handlePlanWeek = useCallback(() => {
    if (!activeWorkspaceId) return
    if (calendarPanel) requestHelpMePlan(`${activeWorkspaceId}-${calendarPanel.slot_name}`)
    else addCalendar(true)
  }, [activeWorkspaceId, calendarPanel, addCalendar])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface">
      <TopBar
        onMenuClick={() => setDrawerOpen((v) => !v)}
        menuOpen={drawerOpen}
        onOrganize={activeWorkspaceId ? handleOrganize : undefined}
        boardHasCalendar={boardHasCalendar}
        onPlanWeek={handlePlanWeek}
        onAddCalendar={handleAddCalendar}
      />
      <DrawerSidebar open={drawerOpen} onClose={closeDrawer} onAddWidget={addWidget} />
      <main ref={canvasRef} className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {workspaces?.length === 0 ? (
          <NoBoards />
        ) : !panels ? (
          <CanvasSkeleton />
        ) : (
          <div className="relative min-h-0 flex-1">
            <WorkspaceBackground />
            <CanvasEngine
              slideFrom={slideFrom}
              onLayoutChange={handleLayoutChange}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onRemovePanel={handleRemovePanel}
              renderPanel={renderPanel}
              getIcon={getIcon}
              getLabel={getLabel}
              renderHeaderActions={renderHeaderActions}
            />
            {/* No starters before the board's widgets are in, or while an add waits or is on its way: a starter could add a second Calendar. */}
            {panels.length === 0 && canvasBoard === activeWorkspaceId && waitingAdds.length === 0
              && !pendingAdds.some((a) => a.workspaceId === activeWorkspaceId) && (
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

/** The width a vertical scrollbar takes from the board when it scrolls (0 with overlay scrollbars). */
function scrollbarWidth(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow-y:scroll'
  document.body.appendChild(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()
  return width
}

/**
 * Which side the board just switched to comes in from: the right for a tab
 * to the right of the last board's (tab order is the board list's), the
 * left for one to its left. Null on the first load, or when either board
 * isn't in the list (one just deleted).
 */
function useBoardSlide(boardId: string | null, boards: ReadonlyArray<{ id: string }> | undefined): 'left' | 'right' | null {
  // Worked out as the board changes, from a ref only, so a repeated render agrees.
  const last = useRef<{ id: string | null; from: 'left' | 'right' | null }>({ id: boardId, from: null })
  if (last.current.id !== boardId) {
    const ids = boards?.map((b) => b.id) ?? []
    const was = last.current.id ? ids.indexOf(last.current.id) : -1
    const now = boardId ? ids.indexOf(boardId) : -1
    last.current = { id: boardId, from: was < 0 || now < 0 ? null : now > was ? 'right' : 'left' }
  }
  return last.current.from
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
