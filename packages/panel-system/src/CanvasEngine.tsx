import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { usePart, usePrimitive, type PrimitiveHandle } from '@ui-sdk/react/primitive'
import { useCanvasStore, clampDimensions, persistableLayout, type PanelItem } from './canvas-store'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import { PanelChrome } from './PanelChrome'
import { PLACEMENT_GAP, STACK_BREAKPOINT } from './geometry'
import { panelBoard, type PanelBoardCommit } from './panel-board'

type BoardHandle = PrimitiveHandle<typeof panelBoard>

/**
 * How long after the last key press a keyboard move or resize is saved, so a
 * held Alt+arrow (key repeat) saves once, not once per step.
 */
export const KEY_SAVE_DELAY = 400

/** What a panel is called: its title, else its lens's label. */
function panelLabel(panel: PanelItem, getLabel?: (lensType: string) => string | undefined): string {
  return panel.title ?? (panel.lensType ? getLabel?.(panel.lensType) : undefined) ?? 'Untitled'
}

export interface CanvasEngineProps {
  onLayoutChange?: (panels: PanelItem[]) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onRemovePanel?: (panelId: string) => void
  /** Render the content for each panel. Receives the panel ID and should return
   *  the lens component wrapped in SubstrateProvider + error boundary. */
  renderPanel?: (panelId: string) => ReactNode
  /** Resolve icon component for a panel's lens type */
  getIcon?: (lensType: string) => ComponentType<{ className?: string }> | undefined
  /** Resolve display label for a panel's lens type */
  getLabel?: (lensType: string) => string | undefined
  /** Render extra header actions (e.g. per-lens config buttons) inside PanelChrome. */
  renderHeaderActions?: (panelId: string) => ReactNode
}

export function CanvasEngine({ onLayoutChange, onDragOver, onDrop, onRemovePanel, renderPanel, getIcon, getLabel, renderHeaderActions }: CanvasEngineProps) {
  const panels = useCanvasStore((s) => s.panels)
  const focusModePanelId = useCanvasStore((s) => s.focusModePanelId)
  const fullscreenPanelId = useCanvasStore((s) => s.fullscreenPanelId)
  const selectedPanelId = useCanvasStore((s) => s.selectedPanelId)
  const exitFocusMode = useCanvasStore((s) => s.exitFocusMode)
  const selectPanel = useCanvasStore((s) => s.selectPanel)
  const canvasRef = useRef<HTMLDivElement>(null)
  const narrow = useNarrowCanvas(canvasRef)

  /* ── Moving and resizing (UI SDK createMove / createResize) ── */

  /** Why the panels last changed through the board, read by the save below. */
  const lastCommitRef = useRef<PanelBoardCommit['reason'] | null>(null)
  const onCommit = useCallback(({ boxes, reason }: PanelBoardCommit) => {
    const { panels: current, movePanel, resizePanel } = useCanvasStore.getState()
    for (const p of current) {
      const b = boxes[p.id]
      if (!b) continue
      if (b.width !== p.width || b.height !== p.height) {
        lastCommitRef.current = reason
        resizePanel(p.id, b.x, b.y, b.width, b.height)
      } else if (b.x !== p.pos_x || b.y !== p.pos_y) {
        lastCommitRef.current = reason
        movePanel(p.id, b.x, b.y)
      }
    }
  }, [])
  const boxes = useMemo(
    () => Object.fromEntries(panels.map((p) => [p.id, { x: p.pos_x, y: p.pos_y, width: p.width, height: p.height }])),
    [panels],
  )
  const panelById = (key: string) => useCanvasStore.getState().panels.find((p) => p.id === key)
  const board = usePrimitive(panelBoard, {
    boxes,
    onCommit,
    canvas: () => {
      const c = canvasRef.current
      return c ? { width: c.clientWidth, height: Math.max(c.clientHeight, c.scrollHeight) } : undefined
    },
    // Stacked, nothing moves; while a widget fills the board, the others are out of sight.
    disabled: () => narrow || useCanvasStore.getState().fullscreenPanelId !== null,
    min: (key) => clampDimensions(0, 0, panelById(key)?.constraints),
    max: (key) => clampDimensions(Infinity, Infinity, panelById(key)?.constraints),
    label: (key) => {
      const panel = panelById(key)
      return panel ? panelLabel(panel, getLabel) : undefined
    },
  })
  const onMoveKey = useCallback((e: KeyboardEvent, panelId: string) => board.api.move.keydown(e, panelId), [board])

  // Activate keyboard shortcuts (] / [ cycle, f fullscreen, Backspace remove, Escape, Alt+arrow move)
  useCanvasKeyboard({ onRemovePanel, canvasRef, onMoveKey })

  const prevPanelsRef = useRef(panels)
  const onLayoutChangeRef = useRef(onLayoutChange)
  useLayoutEffect(() => {
    onLayoutChangeRef.current = onLayoutChange
  })
  /** A keyboard move or resize waiting for the keys to stop before it is saved. */
  const pendingSaveRef = useRef<{ layout: PanelItem[]; timer: ReturnType<typeof setTimeout> } | null>(null)

  // Compute max z_index to determine which panel is focused
  const maxZIndex = panels.length > 0
    ? Math.max(...panels.map((p) => p.z_index))
    : 0

  // Save each change of the panels once: a drop, a click that raises a
  // panel, an add or a remove at once; a run of key presses once the keys stop.
  useEffect(() => {
    if (prevPanelsRef.current === panels) return
    prevPanelsRef.current = panels
    const layout = persistableLayout(useCanvasStore.getState())
    const reason = lastCommitRef.current
    lastCommitRef.current = null
    const pending = pendingSaveRef.current
    if (pending) clearTimeout(pending.timer)
    pendingSaveRef.current = null
    if (reason === 'move-key' || reason === 'resize-key') {
      pendingSaveRef.current = {
        layout,
        timer: setTimeout(() => {
          pendingSaveRef.current = null
          onLayoutChangeRef.current?.(layout)
        }, KEY_SAVE_DELAY),
      }
      return
    }
    // This layout includes a pending keyboard change to the same panels; one
    // to another board's panels (the board just switched) still needs saving.
    if (pending && !pending.layout.some((p) => layout.some((q) => q.id === p.id))) {
      onLayoutChange?.(pending.layout)
    }
    onLayoutChange?.(layout)
  }, [panels, onLayoutChange])

  // Leaving the board doesn't drop a keyboard change still waiting to be saved.
  useEffect(() => () => {
    const pending = pendingSaveRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingSaveRef.current = null
    onLayoutChangeRef.current?.(pending.layout)
  }, [])

  // A fullscreen panel fills the canvas from its top-left, so show the top;
  // leaving fullscreen puts the board back where it was scrolled to.
  const scrollBeforeFullscreen = useRef<number | null>(null)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (fullscreenPanelId) {
      scrollBeforeFullscreen.current ??= canvas.scrollTop
      canvas.scrollTop = 0
    } else if (scrollBeforeFullscreen.current !== null) {
      canvas.scrollTop = scrollBeforeFullscreen.current
      scrollBeforeFullscreen.current = null
    }
  }, [fullscreenPanelId])

  const stackOrder = new Map([...panels].sort(byPosition).map((p, i) => [p.id, i]))

  /** Clicking the canvas background clears the selection and exits focus mode */
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target !== e.currentTarget) return
      if (focusModePanelId) exitFocusMode()
      selectPanel(null)
    },
    [focusModePanelId, exitFocusMode, selectPanel],
  )

  // usePart's props reject data-* keys in an object literal (JSX allows them), hence the cast.
  const canvasData = { 'data-testid': 'canvas-container', 'data-canvas-scroll': true, 'data-layout': narrow ? 'stack' : 'free' } as Record<string, unknown>
  return usePart(board, 'root', {}, {
    ...canvasData,
    ref: canvasRef,
    className:
      narrow
        ? 'relative z-[1] flex h-full w-full flex-col gap-3 overflow-y-auto p-3'
        // Free layout scrolls down when widgets sit below the fold (a full
        // board grows downward rather than stacking widgets on top of each
        // other), except while a widget fills the view.
        : fullscreenPanelId
          ? 'relative z-[1] h-full w-full overflow-hidden'
          : 'relative z-[1] h-full w-full overflow-y-auto overflow-x-hidden',
    onPointerDown: handleCanvasPointerDown,
    onDragOver,
    onDrop,
    children: (
      <>
        {/* One element per panel in both layouts, in store order, so crossing the
            breakpoint only restyles panels: widgets never remount (an
            in-progress recording survives). Stacked reading order comes from CSS
            `order`, not from re-sorting children. */}
        {panels.map((panel) => (
          <DraggablePanel
            key={panel.id}
            board={board}
            panel={panel}
            stackOrder={narrow ? stackOrder.get(panel.id) ?? 0 : undefined}
            // A fullscreen panel sits above every other, even ones sharing its z_index.
            zIndex={fullscreenPanelId === panel.id ? maxZIndex + 1 : panel.z_index}
            isFocused={panel.z_index === maxZIndex}
            isSelected={selectedPanelId === panel.id}
            isDimmed={focusModePanelId !== null && focusModePanelId !== panel.id}
            isFullscreen={!narrow && fullscreenPanelId === panel.id}
            canvasRef={canvasRef}
            onRemovePanel={onRemovePanel}
            renderPanel={renderPanel}
            getIcon={getIcon}
            getLabel={getLabel}
            renderHeaderActions={renderHeaderActions}
          />
        ))}
        {/* Air under the lowest widget once the free board scrolls. */}
        {!narrow && panels.length > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 w-px"
            style={{ top: Math.max(...panels.map((p) => p.pos_y + p.height)), height: PLACEMENT_GAP }}
          />
        )}
      </>
    ),
  }, 'div')
}

/* ── Narrow layout ── */

export { STACK_BREAKPOINT }

function useNarrowCanvas(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setNarrow(el.clientWidth > 0 && el.clientWidth < STACK_BREAKPOINT)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return narrow
}

/** Reading order for the stacked layout: top to bottom, then left to right. */
function byPosition(a: PanelItem, b: PanelItem): number {
  return a.pos_y - b.pos_y || a.pos_x - b.pos_x
}

/* ── Resize handles ── */

export type HandleDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const ALL_DIRECTIONS: HandleDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** How a handle's button is named: "Resize Transcript top left". */
const HANDLE_NAMES: Record<HandleDirection, string> = {
  nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left',
}

const CORNER_SIZE = 12
const EDGE_SIZE = 8

/** Where a handle sits on the panel's edge. Its cursor comes from UI SDK's handleAttrs. */
function getHandleStyle(dir: HandleDirection): React.CSSProperties {
  const half = (size: number) => -size / 2
  const base: React.CSSProperties = { position: 'absolute' }

  switch (dir) {
    case 'nw':
      return { ...base, top: half(CORNER_SIZE), left: half(CORNER_SIZE), width: CORNER_SIZE, height: CORNER_SIZE }
    case 'ne':
      return { ...base, top: half(CORNER_SIZE), right: half(CORNER_SIZE), width: CORNER_SIZE, height: CORNER_SIZE }
    case 'sw':
      return { ...base, bottom: half(CORNER_SIZE), left: half(CORNER_SIZE), width: CORNER_SIZE, height: CORNER_SIZE }
    case 'se':
      return { ...base, bottom: half(CORNER_SIZE), right: half(CORNER_SIZE), width: CORNER_SIZE, height: CORNER_SIZE }
    case 'n':
      return { ...base, top: half(EDGE_SIZE), left: CORNER_SIZE, right: CORNER_SIZE, height: EDGE_SIZE }
    case 's':
      return { ...base, bottom: half(EDGE_SIZE), left: CORNER_SIZE, right: CORNER_SIZE, height: EDGE_SIZE }
    case 'w':
      return { ...base, left: half(EDGE_SIZE), top: CORNER_SIZE, bottom: CORNER_SIZE, width: EDGE_SIZE }
    case 'e':
      return { ...base, right: half(EDGE_SIZE), top: CORNER_SIZE, bottom: CORNER_SIZE, width: EDGE_SIZE }
  }
}

/**
 * A focusable button on the panel's edge or corner: drag it, or focus it and
 * use the arrows (20px a press, Shift for more). Only the selected panel's
 * handles are tab stops, so the board isn't eight stops per widget.
 */
function ResizeHandle({ board, direction, panelId, title, tabStop }: {
  board: BoardHandle
  direction: HandleDirection
  panelId: string
  title: string
  tabStop: boolean
}) {
  return usePart(
    board,
    'handle',
    { id: `${panelId}-${direction}`, box: panelId, handle: direction },
    {
      ...({ 'data-testid': `resize-handle-${direction}` } as Record<string, unknown>),
      type: 'button',
      tabIndex: tabStop ? 0 : -1,
      'aria-label': `Resize ${title} ${HANDLE_NAMES[direction]}`,
      style: getHandleStyle(direction),
      className: 'rounded-full focus-visible:bg-accent focus-visible:outline-none',
    },
    'button',
  )
}

/* ── Draggable panel ── */

interface DraggablePanelProps {
  board: BoardHandle
  panel: PanelItem
  /**
   * Set in the narrow layout: the panel's place in the stacked column. It
   * then renders full width at its saved height, without drag, resize or
   * fullscreen. Purely presentational: the saved free layout is untouched.
   */
  stackOrder?: number
  zIndex: number
  isFocused: boolean
  isSelected?: boolean
  isDimmed?: boolean
  isFullscreen?: boolean
  canvasRef?: React.RefObject<HTMLDivElement | null>
  onRemovePanel?: (panelId: string) => void
  renderPanel?: (panelId: string) => ReactNode
  getIcon?: (lensType: string) => ComponentType<{ className?: string }> | undefined
  getLabel?: (lensType: string) => string | undefined
  renderHeaderActions?: (panelId: string) => ReactNode
}

const PANEL_TRANSITION =
  'left var(--transition-panel), top var(--transition-panel), width var(--transition-panel), height var(--transition-panel), box-shadow var(--transition-panel), opacity var(--transition-panel), scale var(--transition-panel)'

function DraggablePanel({ board, panel, stackOrder, zIndex, isFocused, isSelected, isDimmed, isFullscreen, canvasRef, onRemovePanel, renderPanel, getIcon, getLabel, renderHeaderActions }: DraggablePanelProps) {
  const stacked = stackOrder !== undefined
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const removePanel = useCanvasStore((s) => s.removePanel)
  const toggleFullscreen = useCanvasStore((s) => s.toggleFullscreen)
  const [isHovered, setIsHovered] = useState(false)

  const handlePointerDown = useCallback(() => {
    bringToFront(panel.id)
    useCanvasStore.getState().selectPanel(panel.id)
    if (isDimmed) useCanvasStore.getState().enterFocusMode(panel.id)
  }, [panel.id, bringToFront, isDimmed])

  const handleClose = useCallback(() => {
    if (onRemovePanel) onRemovePanel(panel.id)
    else removePanel(panel.id)
  }, [panel.id, removePanel, onRemovePanel])

  const handleToggleFullscreen = useCallback(() => {
    const canvas = canvasRef?.current
    if (!canvas) return
    bringToFront(panel.id)
    const rect = canvas.getBoundingClientRect()
    toggleFullscreen(panel.id, rect.width, rect.height)
  }, [panel.id, toggleFullscreen, bringToFront, canvasRef])

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => board.api.move.pointerdown(e.nativeEvent, panel.id, e.currentTarget as HTMLElement),
    [board, panel.id],
  )

  const icon = panel.lensType ? getIcon?.(panel.lensType) : undefined
  const label = panelLabel(panel, getLabel)
  const movable = !isFullscreen && !stacked

  const data = {
    'data-testid': `panel-${panel.id}`,
    'data-panel-id': panel.id,
    'data-stack-order': stacked ? stackOrder : undefined,
    // Where the panel is headed, not where a transition has it now (see reveal.ts).
    'data-layout-top': stacked ? undefined : panel.pos_y,
    'data-layout-height': stacked ? undefined : panel.height,
  } as Record<string, unknown>
  return usePart(board, 'panel', { value: panel.id, stacked }, {
    ...data,
    // Scales in as it arrives (motion-safe), as the panels always have.
    className: 'rounded-widget border border-border-subtle motion-safe:animate-panel-in',
    onPointerDown: handlePointerDown,
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    style: ({ dragging }: { dragging: boolean }) => ({
      ...(stacked
        ? {
            position: 'relative',
            order: stackOrder,
            flexShrink: 0,
            width: '100%',
            height: Math.max(panel.height, panel.constraints?.minHeight ?? 0),
          }
        : { zIndex }),
      backgroundColor: 'var(--color-surface-raised)',
      boxShadow: dragging
        ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 50%, transparent)'
        : isSelected
          ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 70%, transparent)'
          : (isFocused || isHovered)
            ? 'var(--shadow-panel-focused)'
            : 'var(--shadow-panel)',
      opacity: isDimmed ? 0.3 : 1,
      // Lifted while dragged. The box follows the pointer with no transition
      // (so it doesn't lag); switching layouts snaps too.
      scale: dragging ? '1.015' : undefined,
      transition: stacked ? undefined : dragging ? 'scale var(--transition-panel)' : PANEL_TRANSITION,
    }),
    children: (
      <>
        {movable && (
          <div
            style={{ pointerEvents: isHovered ? 'auto' : 'none' }}
            data-testid={`resize-handles-${panel.id}`}
          >
            {ALL_DIRECTIONS.map((dir) => (
              <ResizeHandle key={dir} board={board} direction={dir} panelId={panel.id} title={label} tabStop={!!isSelected} />
            ))}
          </div>
        )}
        <PanelChrome
          panelId={panel.id}
          title={label}
          icon={icon}
          onClose={handleClose}
          onDragHandlePointerDown={movable ? onHeaderPointerDown : undefined}
          isFullscreen={isFullscreen}
          onToggleFullscreen={stacked ? undefined : handleToggleFullscreen}
          headerActions={renderHeaderActions?.(panel.id)}
        >
          {renderPanel?.(panel.id)}
        </PanelChrome>
      </>
    ),
  }, 'div')
}
