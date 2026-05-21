import { useCallback, useEffect, useRef } from 'react'
import { motion, useMotionValue } from 'motion/react'
import { useCanvasStore, type PanelItem } from './canvas-store'

export interface CanvasEngineProps {
  onLayoutChange?: (panels: PanelItem[]) => void
}

export function CanvasEngine({ onLayoutChange }: CanvasEngineProps) {
  const panels = useCanvasStore((s) => s.panels)

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
        <DraggablePanel key={panel.id} panel={panel} />
      ))}
    </div>
  )
}

interface DraggablePanelProps {
  panel: PanelItem
}

function DraggablePanel({ panel }: DraggablePanelProps) {
  const movePanel = useCanvasStore((s) => s.movePanel)
  const bringToFront = useCanvasStore((s) => s.bringToFront)

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const handleDragEnd = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
      if (!current) return
      movePanel(panel.id, current.pos_x + info.offset.x, current.pos_y + info.offset.y)
      x.set(0)
      y.set(0)
    },
    [panel.id, movePanel, x, y],
  )

  const handlePointerDown = useCallback(() => {
    bringToFront(panel.id)
  }, [panel.id, bringToFront])

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
        x,
        y,
      }}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      className="cursor-grab rounded-[var(--radius-panel)] border border-border-subtle active:cursor-grabbing"
      whileHover={{
        boxShadow: 'var(--shadow-panel-focused)',
      }}
      transition={{ type: 'tween', duration: 0.15 }}
    >
      <div className="flex h-full w-full items-center justify-center select-none">
        <span className="text-sm font-medium text-text-secondary opacity-60">
          {panel.id}
        </span>
      </div>
    </motion.div>
  )
}
