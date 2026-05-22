import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { motion, useDragControls, useMotionValue } from 'motion/react'
import { useCanvasStore, clampDimensions, type PanelItem } from './canvas-store'
import { useShiftKey } from './useShiftKey'
import { useFocusMode } from './useFocusMode'
import { snapToGrid } from './snap'
import { PanelChrome } from './PanelChrome'

export interface CanvasEngineProps {
  onLayoutChange?: (panels: PanelItem[]) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  /** Render the content for each panel. Receives the panel ID and should return
   *  the lens component wrapped in SubstrateProvider + error boundary. */
  renderPanel?: (panelId: string) => ReactNode
  /** Resolve icon component for a panel's lens type */
  getIcon?: (lensType: string) => ComponentType<{ className?: string }> | undefined
  /** Resolve display label for a panel's lens type */
  getLabel?: (lensType: string) => string | undefined
}

export function CanvasEngine({ onLayoutChange, onDragOver, onDrop, renderPanel, getIcon, getLabel }: CanvasEngineProps) {
  const panels = useCanvasStore((s) => s.panels)
  const focusModePanelId = useCanvasStore((s) => s.focusModePanelId)
  const fullscreenPanelId = useCanvasStore((s) => s.fullscreenPanelId)
  const exitFocusMode = useCanvasStore((s) => s.exitFocusMode)
  const shiftRef = useShiftKey()
  const canvasRef = useRef<HTMLDivElement>(null)

  // Activate keyboard shortcuts (F, Escape)
  useFocusMode()

  const prevPanelsRef = useRef(panels)

  // Compute max z_index to determine which panel is focused
  const maxZIndex = panels.length > 0
    ? Math.max(...panels.map((p) => p.z_index))
    : 0

  useEffect(() => {
    if (prevPanelsRef.current !== panels) {
      prevPanelsRef.current = panels
      onLayoutChange?.(panels)
    }
  }, [panels, onLayoutChange])

  /** Clicking the canvas background exits focus mode */
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target === e.currentTarget && focusModePanelId) {
        exitFocusMode()
      }
    },
    [focusModePanelId, exitFocusMode],
  )

  return (
    <div
      ref={canvasRef}
      data-testid="canvas-container"
      data-canvas-scroll
      className="relative z-[1] h-full w-full overflow-hidden"
      onPointerDown={handleCanvasPointerDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {panels.map((panel) => (
        <DraggablePanel
          key={panel.id}
          panel={panel}
          shiftRef={shiftRef}
          isFocused={panel.z_index === maxZIndex}
          isDimmed={focusModePanelId !== null && focusModePanelId !== panel.id}
          isFullscreen={fullscreenPanelId === panel.id}
          canvasRef={canvasRef}
          renderPanel={renderPanel}
          getIcon={getIcon}
          getLabel={getLabel}
        />
      ))}
    </div>
  )
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
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY

      let newW = panelW
      let newH = panelH

      if (axes.dx === 1) {
        newW = panelW + deltaX
      } else if (axes.dx === -1) {
        newW = panelW - deltaX
      }

      if (axes.dy === 1) {
        newH = panelH + deltaY
      } else if (axes.dy === -1) {
        newH = panelH - deltaY
      }

      if (shiftRef.current) {
        newW = snapToGrid(newW)
        newH = snapToGrid(newH)
      }

      const panel = useCanvasStore.getState().panels.find((p) => p.id === panelId)
      const clamped = clampDimensions(newW, newH, panel?.constraints)

      const newX = axes.dx === -1 ? panelX + panelW - clamped.width : panelX
      const newY = axes.dy === -1 ? panelY + panelH - clamped.height : panelY

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

/* ── Draggable panel ── */

interface DraggablePanelProps {
  panel: PanelItem
  shiftRef: React.RefObject<boolean>
  isFocused: boolean
  isDimmed?: boolean
  isFullscreen?: boolean
  canvasRef?: React.RefObject<HTMLDivElement | null>
  renderPanel?: (panelId: string) => ReactNode
  getIcon?: (lensType: string) => ComponentType<{ className?: string }> | undefined
  getLabel?: (lensType: string) => string | undefined
}

function DraggablePanel({ panel, shiftRef, isFocused, isDimmed, isFullscreen, canvasRef, renderPanel, getIcon, getLabel }: DraggablePanelProps) {
  const movePanel = useCanvasStore((s) => s.movePanel)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const removePanel = useCanvasStore((s) => s.removePanel)
  const toggleFullscreen = useCanvasStore((s) => s.toggleFullscreen)
  const [isHovered, setIsHovered] = useState(false)
  const [isGesturing, setIsGesturing] = useState(false)

  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const handleResizeGestureChange = useCallback((active: boolean) => {
    setIsGesturing(active)
  }, [])

  const handleDragStart = useCallback(() => {
    setIsGesturing(true)
  }, [])

  const handleDragEnd = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
      if (!current) return

      let newX = current.pos_x + info.offset.x
      let newY = current.pos_y + info.offset.y

      if (shiftRef.current) {
        newX = snapToGrid(newX)
        newY = snapToGrid(newY)
      }

      const canvas = canvasRef?.current
      if (canvas) {
        const visible = Math.min(100, current.width / 2, current.height / 2)
        newX = Math.max(visible - current.width, Math.min(newX, canvas.clientWidth - visible))
        newY = Math.max(0, Math.min(newY, canvas.clientHeight - visible))
      }

      x.jump(0)
      y.jump(0)
      movePanel(panel.id, newX, newY)
      requestAnimationFrame(() => {
        setIsGesturing(false)
      })
    },
    [panel.id, movePanel, x, y, shiftRef, canvasRef],
  )

  const handlePointerDown = useCallback(() => {
    bringToFront(panel.id)
    if (isDimmed) {
      useCanvasStore.getState().enterFocusMode(panel.id)
    }
  }, [panel.id, bringToFront, isDimmed])

  const handleDrag = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
      if (!current) return

      let offsetX = info.offset.x
      let offsetY = info.offset.y

      if (shiftRef.current) {
        offsetX = snapToGrid(current.pos_x + offsetX) - current.pos_x
        offsetY = snapToGrid(current.pos_y + offsetY) - current.pos_y
      }

      const canvas = canvasRef?.current
      if (canvas) {
        const visible = Math.min(100, current.width / 2, current.height / 2)
        const minX = visible - current.width - current.pos_x
        const maxX = canvas.clientWidth - visible - current.pos_x
        const minY = -current.pos_y
        const maxY = canvas.clientHeight - visible - current.pos_y
        offsetX = Math.max(minX, Math.min(maxX, offsetX))
        offsetY = Math.max(minY, Math.min(maxY, offsetY))
      }

      x.set(offsetX)
      y.set(offsetY)
    },
    [panel.id, shiftRef, x, y, canvasRef],
  )

  const handleClose = useCallback(() => {
    removePanel(panel.id)
  }, [panel.id, removePanel])

  const handleDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isFullscreen) return
      dragControls.start(e)
    },
    [dragControls, isFullscreen],
  )

  const handleToggleFullscreen = useCallback(() => {
    const canvas = canvasRef?.current
    if (!canvas) return
    bringToFront(panel.id)
    const rect = canvas.getBoundingClientRect()
    toggleFullscreen(panel.id, rect.width, rect.height)
  }, [panel.id, toggleFullscreen, bringToFront, canvasRef])

  const shadow = (isFocused || isGesturing || isHovered)
    ? 'var(--shadow-panel-focused)'
    : 'var(--shadow-panel)'

  const transitionStyle = isGesturing
    ? undefined
    : 'left var(--transition-panel), top var(--transition-panel), width var(--transition-panel), height var(--transition-panel), box-shadow var(--transition-panel), opacity var(--transition-panel)'

  // Resolve icon and label from the lens manifest
  const icon = panel.lensType ? getIcon?.(panel.lensType) : undefined
  const label = panel.title ?? (panel.lensType ? getLabel?.(panel.lensType) : undefined) ?? 'Untitled'

  return (
    <motion.div
      data-testid={`panel-${panel.id}`}
      data-panel-id={panel.id}
      drag={!isFullscreen}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      style={{
        position: 'absolute',
        left: panel.pos_x,
        top: panel.pos_y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.z_index,
        backgroundColor: 'var(--color-surface-raised)',
        boxShadow: shadow,
        opacity: isDimmed ? 0.3 : 1,
        transition: transitionStyle,
        x,
        y,
      }}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="rounded-[var(--radius-panel)] border border-border"
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      transition={{ type: 'tween', duration: 0.2 }}
    >
      {/* Resize handles */}
      <div
        style={{ pointerEvents: (isHovered && !isFullscreen) ? 'auto' : 'none' }}
        data-testid={`resize-handles-${panel.id}`}
      >
        {ALL_DIRECTIONS.map((dir) => (
          <ResizeHandle
            key={dir}
            direction={dir}
            panelId={panel.id}
            shiftRef={shiftRef}
            onGestureChange={handleResizeGestureChange}
          />
        ))}
      </div>

      <PanelChrome
        panelId={panel.id}
        title={label}
        icon={icon}
        onClose={handleClose}
        onDragHandlePointerDown={handleDragHandlePointerDown}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      >
        {renderPanel?.(panel.id)}
      </PanelChrome>
    </motion.div>
  )
}
