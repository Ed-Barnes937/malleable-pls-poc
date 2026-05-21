import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useMotionValue } from 'motion/react'
import { useCanvasStore, clampDimensions, type PanelItem } from './canvas-store'
import { useShiftKey } from './useShiftKey'
import { snapToGrid } from './snap'

export interface CanvasEngineProps {
  onLayoutChange?: (panels: PanelItem[]) => void
}

export function CanvasEngine({ onLayoutChange }: CanvasEngineProps) {
  const panels = useCanvasStore((s) => s.panels)
  const shiftRef = useShiftKey()

  const prevPanelsRef = useRef(panels)

  useEffect(() => {
    if (prevPanelsRef.current !== panels) {
      prevPanelsRef.current = panels
      onLayoutChange?.(panels)
    }
  }, [panels, onLayoutChange])

  return (
    <div
      data-testid="canvas-container"
      className="relative h-full w-full overflow-auto"
    >
      {panels.map((panel) => (
        <DraggablePanel key={panel.id} panel={panel} shiftRef={shiftRef} />
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

/** Which axes are affected by each handle direction */
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
}

function ResizeHandle({ direction, panelId, shiftRef }: ResizeHandleProps) {
  const resizePanel = useCanvasStore((s) => s.resizePanel)
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

      startRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panelX: panel.pos_x,
        panelY: panel.pos_y,
        panelW: panel.width,
        panelH: panel.height,
      }

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
    },
    [panelId],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      e.stopPropagation()

      const { startX, startY, panelX, panelY, panelW, panelH } = startRef.current
      const axes = HANDLE_AXES[direction]
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY

      let newX = panelX
      let newY = panelY
      let newW = panelW
      let newH = panelH

      // Horizontal axis
      if (axes.dx === 1) {
        // East edge: grow width
        newW = panelW + deltaX
      } else if (axes.dx === -1) {
        // West edge: move origin + shrink width
        newX = panelX + deltaX
        newW = panelW - deltaX
      }

      // Vertical axis
      if (axes.dy === 1) {
        // South edge: grow height
        newH = panelH + deltaY
      } else if (axes.dy === -1) {
        // North edge: move origin + shrink height
        newY = panelY + deltaY
        newH = panelH - deltaY
      }

      // Apply shift-snap to dimensions
      if (shiftRef.current) {
        newW = snapToGrid(newW)
        newH = snapToGrid(newH)
        if (axes.dx !== 0) newX = snapToGrid(newX)
        if (axes.dy !== 0) newY = snapToGrid(newY)
      }

      // Clamp dimensions (store also clamps, but pre-clamp to fix position)
      const panel = useCanvasStore.getState().panels.find((p) => p.id === panelId)
      const clamped = clampDimensions(newW, newH, panel?.constraints)

      // If clamping changed dimensions, adjust position for leading-edge handles
      if (axes.dx === -1) {
        newX = panelX + panelW - clamped.width
      }
      if (axes.dy === -1) {
        newY = panelY + panelH - clamped.height
      }

      resizePanel(panelId, newX, newY, clamped.width, clamped.height)
    },
    [direction, panelId, resizePanel, shiftRef],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      e.stopPropagation()
      startRef.current = null
      const target = e.currentTarget as HTMLElement
      target.releasePointerCapture(e.pointerId)
    },
    [],
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
}

function DraggablePanel({ panel, shiftRef }: DraggablePanelProps) {
  const movePanel = useCanvasStore((s) => s.movePanel)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const [isHovered, setIsHovered] = useState(false)
  const [isGesturing, setIsGesturing] = useState(false)

  const x = useMotionValue(0)
  const y = useMotionValue(0)

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

      movePanel(panel.id, newX, newY)
      x.set(0)
      y.set(0)
      setIsGesturing(false)
    },
    [panel.id, movePanel, x, y, shiftRef],
  )

  const handlePointerDown = useCallback(() => {
    bringToFront(panel.id)
  }, [panel.id, bringToFront])

  const handleDrag = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      if (shiftRef.current) {
        const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
        if (!current) return
        const snappedX = snapToGrid(current.pos_x + info.offset.x) - current.pos_x
        const snappedY = snapToGrid(current.pos_y + info.offset.y) - current.pos_y
        x.set(snappedX)
        y.set(snappedY)
      }
    },
    [panel.id, shiftRef, x, y],
  )

  // Transition for smooth animated position/size changes when at rest
  const transitionStyle = isGesturing
    ? undefined
    : 'left var(--transition-panel), top var(--transition-panel), width var(--transition-panel), height var(--transition-panel)'

  return (
    <motion.div
      data-testid={`panel-${panel.id}`}
      data-panel-id={panel.id}
      drag
      dragMomentum={false}
      style={{
        position: 'absolute',
        left: panel.pos_x,
        top: panel.pos_y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.z_index,
        backgroundColor: (panel.meta?.colour as string) ?? 'var(--color-surface-raised)',
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
      className="cursor-grab rounded-[var(--radius-panel)] border border-border-subtle active:cursor-grabbing"
      whileHover={{
        boxShadow: 'var(--shadow-panel-focused)',
      }}
      transition={{ type: 'tween', duration: 0.15 }}
    >
      {/* Resize handles — only interactive on hover */}
      <div
        style={{ pointerEvents: isHovered ? 'auto' : 'none' }}
        data-testid={`resize-handles-${panel.id}`}
      >
        {ALL_DIRECTIONS.map((dir) => (
          <ResizeHandle
            key={dir}
            direction={dir}
            panelId={panel.id}
            shiftRef={shiftRef}
          />
        ))}
      </div>

      <div className="flex h-full w-full items-center justify-center select-none">
        <span className="text-sm font-medium text-text-secondary opacity-60">
          {panel.id}
        </span>
      </div>
    </motion.div>
  )
}
