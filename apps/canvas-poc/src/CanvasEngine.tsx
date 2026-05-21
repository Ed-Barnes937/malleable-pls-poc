import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { useCanvasStore, type PanelItem } from './canvas-store'

export interface CanvasEngineProps {
  onLayoutChange?: (panels: PanelItem[]) => void
}

export function CanvasEngine({ onLayoutChange }: CanvasEngineProps) {
  const panels = useCanvasStore((s) => s.panels)
  const movePanel = useCanvasStore((s) => s.movePanel)
  const bringToFront = useCanvasStore((s) => s.bringToFront)

  const prevPanelsRef = useRef(panels)

  useEffect(() => {
    if (prevPanelsRef.current !== panels) {
      prevPanelsRef.current = panels
      onLayoutChange?.(panels)
    }
  }, [panels, onLayoutChange])

  const handleDragEnd = useCallback(
    (id: string, _event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const panel = useCanvasStore.getState().panels.find((p) => p.id === id)
      if (!panel) return
      const newX = panel.pos_x + info.offset.x
      const newY = panel.pos_y + info.offset.y
      movePanel(id, newX, newY)
    },
    [movePanel],
  )

  const handlePointerDown = useCallback(
    (id: string) => {
      bringToFront(id)
    },
    [bringToFront],
  )

  return (
    <div
      data-testid="canvas-container"
      className="relative h-full w-full overflow-auto"
    >
      {panels.map((panel) => (
        <motion.div
          key={panel.id}
          data-testid={`panel-${panel.id}`}
          data-panel-id={panel.id}
          drag
          dragMomentum={false}
          onDragEnd={(event, info) => handleDragEnd(panel.id, event as PointerEvent, info)}
          onPointerDown={() => handlePointerDown(panel.id)}
          style={{
            position: 'absolute',
            left: panel.pos_x,
            top: panel.pos_y,
            width: panel.width,
            height: panel.height,
            zIndex: panel.z_index,
            backgroundColor: (panel.meta?.colour as string) ?? 'var(--color-surface-raised)',
          }}
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
      ))}
    </div>
  )
}
