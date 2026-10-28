import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { motion, useDragControls, useMotionValue } from 'motion/react'
import { useCanvasStore, clampDimensions, persistableLayout, type PanelItem } from './canvas-store'
import { useShiftKey } from './useShiftKey'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import { snapToGrid } from './snap'
import { PanelChrome } from './PanelChrome'
import { clampToCanvas, resizeDimensions, anchoredPosition, PLACEMENT_GAP } from './geometry'

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
  const shiftRef = useShiftKey()
  const canvasRef = useRef<HTMLDivElement>(null)

  // Activate keyboard shortcuts (] / [ cycle, f fullscreen, Backspace remove, Escape)
  useCanvasKeyboard({ onRemovePanel, canvasRef })

  const prevPanelsRef = useRef(panels)

  // Compute max z_index to determine which panel is focused
  const maxZIndex = panels.length > 0
    ? Math.max(...panels.map((p) => p.z_index))
    : 0

  useEffect(() => {
    if (prevPanelsRef.current !== panels) {
      prevPanelsRef.current = panels
      onLayoutChange?.(persistableLayout(useCanvasStore.getState()))
    }
  }, [panels, onLayoutChange])

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

  const narrow = useNarrowCanvas(canvasRef)
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

  return (
    <div
      ref={canvasRef}
      data-testid="canvas-container"
      data-canvas-scroll
      data-layout={narrow ? 'stack' : 'free'}
      className={
        narrow
          ? 'relative z-[1] flex h-full w-full flex-col gap-3 overflow-y-auto p-3'
          // Free layout scrolls down when widgets sit below the fold (a full
          // board grows downward rather than stacking widgets on top of each
          // other), except while a widget fills the view.
          : fullscreenPanelId
            ? 'relative z-[1] h-full w-full overflow-hidden'
            : 'relative z-[1] h-full w-full overflow-y-auto overflow-x-hidden'
      }
      onPointerDown={handleCanvasPointerDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* One element per panel in both layouts, in store order, so crossing the
          breakpoint only restyles panels: widgets never remount (an
          in-progress recording survives). Stacked reading order comes from CSS
          `order`, not from re-sorting children. */}
      {panels.map((panel) => (
        <DraggablePanel
          key={panel.id}
          panel={panel}
          shiftRef={shiftRef}
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
      {/* Air under the lowest widget once the free board scrolls, plus any
          slack the shell sets (`--board-slack`) to keep the board still as
          the toast bar under it shrinks. */}
      {!narrow && panels.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 w-px"
          style={{ top: Math.max(...panels.map((p) => p.pos_y + p.height)), height: `calc(${PLACEMENT_GAP}px + var(--board-slack, 0px))` }}
        />
      )}
      {/* The stacked board's slack, last; its negative margin cancels the column gap, so it takes no room without slack. */}
      {narrow && <div aria-hidden className="pointer-events-none order-[9999] -mt-3 w-px shrink-0" style={{ height: 'var(--board-slack, 0px)' }} />}
    </div>
  )
}

/* ── Narrow layout ── */

/** Below this canvas width, panels stack in one scrolling column instead of floating. */
export const STACK_BREAKPOINT = 640

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

/* ── Handle directions ── */

export type HandleDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLE_CURSORS: Record<HandleDirection, string> = {
  nw: 'nw-resize',
  n: 'n-resize',
  ne: 'ne-resize',
  e: 'e-resize',
  se: 'se-resize',
  s: 's-resize',
  sw: 'sw-resize',
  w: 'w-resize',
}

const HANDLE_AXES: Record<HandleDirection, { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }> = {
  nw: { dx: -1, dy: -1 },
  n:  { dx:  0, dy: -1 },
  ne: { dx:  1, dy: -1 },
  e:  { dx:  1, dy:  0 },
  se: { dx:  1, dy:  1 },
  s:  { dx:  0, dy:  1 },
  sw: { dx: -1, dy:  1 },
  w:  { dx: -1, dy:  0 },
}

const ALL_DIRECTIONS: HandleDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/* ── Handle positioning styles ── */

const CORNER_SIZE = 12
const EDGE_SIZE = 8

function getHandleStyle(dir: HandleDirection): React.CSSProperties {
  const half = (size: number) => -size / 2
  const base: React.CSSProperties = {
    position: 'absolute',
    cursor: HANDLE_CURSORS[dir],
  }

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

/* ── Resize handle component ── */

interface ResizeHandleProps {
  direction: HandleDirection
  panelId: string
  shiftRef: React.RefObject<boolean>
  onGestureChange: (active: boolean) => void
}

function ResizeHandle({ direction, panelId, shiftRef, onGestureChange }: ResizeHandleProps) {
  const resizePanel = useCanvasStore((s) => s.resizePanel)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const startRef = useRef<{
    startX: number
    startY: number
    panelX: number
    panelY: number
    panelW: number
    panelH: number
  } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const panel = useCanvasStore.getState().panels.find((p) => p.id === panelId)
      if (!panel) return

      bringToFront(panelId)

      startRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panelX: panel.pos_x,
        panelY: panel.pos_y,
        panelW: panel.width,
        panelH: panel.height,
      }

      onGestureChange(true)
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
    },
    [panelId, bringToFront, onGestureChange],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      e.stopPropagation()

      const { startX, startY, panelX, panelY, panelW, panelH } = startRef.current
      const axes = HANDLE_AXES[direction]
      const delta = { x: e.clientX - startX, y: e.clientY - startY }

      let { w: newW, h: newH } = resizeDimensions({ w: panelW, h: panelH }, axes, delta)

      if (shiftRef.current) {
        newW = snapToGrid(newW)
        newH = snapToGrid(newH)
      }

      const panel = useCanvasStore.getState().panels.find((p) => p.id === panelId)
      const clamped = clampDimensions(newW, newH, panel?.constraints)
      const { x: newX, y: newY } = anchoredPosition(
        { x: panelX, y: panelY, w: panelW, h: panelH },
        axes,
        clamped.width,
        clamped.height,
      )

      resizePanel(panelId, newX, newY, clamped.width, clamped.height)
    },
    [direction, panelId, resizePanel, shiftRef],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      e.stopPropagation()
      startRef.current = null
      onGestureChange(false)
      const target = e.currentTarget as HTMLElement
      target.releasePointerCapture(e.pointerId)
    },
    [onGestureChange],
  )

  return (
    <div
      data-testid={`resize-handle-${direction}`}
      style={getHandleStyle(direction)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  )
}

/* ── Drag hook ── */

function usePanelDrag(
  panel: PanelItem,
  opts: { shiftRef: React.RefObject<boolean>; canvasRef: React.RefObject<HTMLDivElement | null>; isFullscreen: boolean },
) {
  const movePanel = useCanvasStore((s) => s.movePanel)
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [isGesturing, setIsGesturing] = useState(false)
  const { shiftRef, canvasRef, isFullscreen } = opts

  const onGestureChange = useCallback((active: boolean) => setIsGesturing(active), [])

  const onDragStart = useCallback(() => setIsGesturing(true), [])

  const onDrag = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
      if (!current) return

      let offsetX = info.offset.x
      let offsetY = info.offset.y

      if (shiftRef.current) {
        offsetX = snapToGrid(current.pos_x + offsetX) - current.pos_x
        offsetY = snapToGrid(current.pos_y + offsetY) - current.pos_y
      }

      const canvas = canvasRef.current
      if (canvas) {
        const clamped = clampToCanvas(
          { x: current.pos_x + offsetX, y: current.pos_y + offsetY },
          { width: current.width, height: current.height },
          { width: canvas.clientWidth, height: Math.max(canvas.clientHeight, canvas.scrollHeight) },
        )
        offsetX = clamped.x - current.pos_x
        offsetY = clamped.y - current.pos_y
      }

      x.set(offsetX)
      y.set(offsetY)
    },
    [panel.id, shiftRef, x, y, canvasRef],
  )

  const onDragEnd = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
      if (!current) return

      let newX = current.pos_x + info.offset.x
      let newY = current.pos_y + info.offset.y

      if (shiftRef.current) {
        newX = snapToGrid(newX)
        newY = snapToGrid(newY)
      }

      const canvas = canvasRef.current
      if (canvas) {
        const clamped = clampToCanvas(
          { x: newX, y: newY },
          { width: current.width, height: current.height },
          { width: canvas.clientWidth, height: Math.max(canvas.clientHeight, canvas.scrollHeight) },
        )
        newX = clamped.x
        newY = clamped.y
      }

      x.jump(0)
      y.jump(0)
      movePanel(panel.id, newX, newY)
      requestAnimationFrame(() => setIsGesturing(false))
    },
    [panel.id, movePanel, x, y, shiftRef, canvasRef],
  )

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isFullscreen) return
      dragControls.start(e)
    },
    [dragControls, isFullscreen],
  )

  return { x, y, isGesturing, onGestureChange, dragControls, onDragStart, onDrag, onDragEnd, onDragHandlePointerDown }
}

/* ── Draggable panel ── */

interface DraggablePanelProps {
  panel: PanelItem
  shiftRef: React.RefObject<boolean>
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

function DraggablePanel({ panel, shiftRef, stackOrder, zIndex, isFocused, isSelected, isDimmed, isFullscreen, canvasRef, onRemovePanel, renderPanel, getIcon, getLabel, renderHeaderActions }: DraggablePanelProps) {
  const stacked = stackOrder !== undefined
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const removePanel = useCanvasStore((s) => s.removePanel)
  const toggleFullscreen = useCanvasStore((s) => s.toggleFullscreen)
  const [isHovered, setIsHovered] = useState(false)

  const { x, y, isGesturing, onGestureChange, dragControls, onDragStart, onDrag, onDragEnd, onDragHandlePointerDown } =
    usePanelDrag(panel, { shiftRef, canvasRef: canvasRef ?? { current: null }, isFullscreen: isFullscreen ?? false })

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

  const shadow = isGesturing
    ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 50%, transparent)'
    : isSelected
      ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 70%, transparent)'
      : (isFocused || isHovered)
        ? 'var(--shadow-panel-focused)'
        : 'var(--shadow-panel)'

  // No layout animation while gesturing or stacked (switching layouts should snap).
  const transitionStyle = isGesturing || stacked
    ? undefined
    : 'left var(--transition-panel), top var(--transition-panel), width var(--transition-panel), height var(--transition-panel), box-shadow var(--transition-panel), opacity var(--transition-panel)'

  const icon = panel.lensType ? getIcon?.(panel.lensType) : undefined
  const label = panel.title ?? (panel.lensType ? getLabel?.(panel.lensType) : undefined) ?? 'Untitled'

  return (
    <motion.div
      data-testid={`panel-${panel.id}`}
      data-panel-id={panel.id}
      data-stack-order={stacked ? stackOrder : undefined}
      // Where the panel is headed, not where a transition has it now (see reveal.ts).
      data-layout-top={stacked ? undefined : panel.pos_y}
      data-layout-height={stacked ? undefined : panel.height}
      drag={!isFullscreen && !stacked}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      style={{
        ...(stacked
          ? {
              position: 'relative',
              order: stackOrder,
              flexShrink: 0,
              width: '100%',
              height: Math.max(panel.height, panel.constraints?.minHeight ?? 0),
            }
          : {
              position: 'absolute',
              left: panel.pos_x,
              top: panel.pos_y,
              width: panel.width,
              height: panel.height,
              zIndex,
            }),
        backgroundColor: 'var(--color-surface-raised)',
        boxShadow: shadow,
        opacity: isDimmed ? 0.3 : 1,
        transition: transitionStyle,
        x,
        y,
      }}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="rounded-widget border border-border-subtle"
      initial={{ scale: 0.95 }}
      animate={{ scale: isGesturing ? 1.015 : 1 }}
      transition={{ type: 'tween', duration: 0.2 }}
    >
      <div
        style={{ pointerEvents: (isHovered && !isFullscreen && !stacked) ? 'auto' : 'none' }}
        data-testid={`resize-handles-${panel.id}`}
      >
        {ALL_DIRECTIONS.map((dir) => (
          <ResizeHandle
            key={dir}
            direction={dir}
            panelId={panel.id}
            shiftRef={shiftRef}
            onGestureChange={onGestureChange}
          />
        ))}
      </div>

      <PanelChrome
        panelId={panel.id}
        title={label}
        icon={icon}
        onClose={handleClose}
        onDragHandlePointerDown={stacked ? undefined : onDragHandlePointerDown}
        isFullscreen={isFullscreen}
        onToggleFullscreen={stacked ? undefined : handleToggleFullscreen}
        headerActions={renderHeaderActions?.(panel.id)}
      >
        {renderPanel?.(panel.id)}
      </PanelChrome>
    </motion.div>
  )
}
