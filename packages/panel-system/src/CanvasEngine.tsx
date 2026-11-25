import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { usePart, usePrimitive, type PrimitiveHandle } from '@ui-sdk/react/primitive'
import { useCanvasStore, clampDimensions, persistableLayout, type PanelItem } from './canvas-store'
import { useShiftKey } from './useShiftKey'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import { GRID_SIZE } from './snap'
import { PanelChrome } from './PanelChrome'
import { PLACEMENT_GAP, STACK_BREAKPOINT } from './geometry'
import { board, type BoardCommit } from './spike-board'

type BoardHandle = PrimitiveHandle<typeof board>

// SPIKE: same rules as useCanvasKeyboard's private helpers.
function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true
  return el instanceof HTMLElement && el.isContentEditable
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
      // SPIKE: count layout-change calls for the Playwright assertions.
      const w = window as unknown as { __layoutChanges?: number }
      w.__layoutChanges = (w.__layoutChanges ?? 0) + 1
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

  // SPIKE: UI SDK move/resize over the canvas store.
  const boxes = useMemo(
    () => Object.fromEntries(panels.map((p) => [p.id, { x: p.pos_x, y: p.pos_y, width: p.width, height: p.height }])),
    [panels],
  )
  const onCommit = useCallback(({ boxes: next }: BoardCommit) => {
    // One store write per commit, so the layout effect below persists once.
    useCanvasStore.setState((state) => ({
      panels: state.panels.map((p) => {
        const b = next[p.id]
        if (!b || (b.x === p.pos_x && b.y === p.pos_y && b.width === p.width && b.height === p.height)) return p
        return { ...p, pos_x: b.x, pos_y: b.y, width: b.width, height: b.height }
      }),
    }))
  }, [])
  const handle = usePrimitive(board, {
    boxes,
    onCommit,
    // Today Shift snaps to the 20px grid; without it positions are free.
    step: () => (shiftRef.current ? GRID_SIZE : 1),
    largeStep: () => GRID_SIZE,
    canvas: () => {
      const c = canvasRef.current
      return c ? { width: c.clientWidth, height: Math.max(c.clientHeight, c.scrollHeight) } : undefined
    },
    isDisabled: (key) => narrow || fullscreenPanelId === key,
    min: (key) => clampDimensions(0, 0, panels.find((p) => p.id === key)?.constraints),
    max: (key) => {
      const c = panels.find((p) => p.id === key)?.constraints
      return c?.maxWidth || c?.maxHeight ? { width: c.maxWidth ?? Infinity, height: c.maxHeight ?? Infinity } : undefined
    },
    label: (key) => panels.find((p) => p.id === key)?.title ?? getLabel?.(panels.find((p) => p.id === key)?.lensType ?? ''),
  })

  // SPIKE: Alt+arrows move the selected panel, unless typing or focus is outside the canvas.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const id = useCanvasStore.getState().selectedPanelId
      const el = document.activeElement
      const outside = el && el !== document.body && el !== document.documentElement && !canvasRef.current?.contains(el)
      if (!id || isTyping() || outside) return
      handle.api.move.keydown(e, id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handle])

  /** Clicking the canvas background clears the selection and exits focus mode */
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.target !== e.currentTarget) return
      if (focusModePanelId) exitFocusMode()
      selectPanel(null)
    },
    [focusModePanelId, exitFocusMode, selectPanel],
  )

  // usePart's props object rejects data-* keys in a literal (JSX allows them), hence the spread.
  const canvasData: Record<string, unknown> = { 'data-testid': 'canvas-container', 'data-canvas-scroll': true, 'data-layout': narrow ? 'stack' : 'free' }
  return usePart(handle, 'root', {}, {
    ...canvasData,
    ref: canvasRef,
    className:
      narrow
        ? 'relative z-[1] flex h-full w-full flex-col gap-3 overflow-y-auto p-3'
        : fullscreenPanelId
          ? 'relative z-[1] h-full w-full overflow-hidden'
          : 'relative z-[1] h-full w-full overflow-y-auto overflow-x-hidden',
    onPointerDown: handleCanvasPointerDown,
    onDragOver,
    onDrop,
    children: (
      <>
        {panels.map((panel) => (
          <DraggablePanel
            key={panel.id}
            board={handle}
            panel={panel}
            stackOrder={narrow ? stackOrder.get(panel.id) ?? 0 : undefined}
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

/* ── Resize handle (SPIKE: a UI SDK handle part, a focusable button) ── */

const HANDLE_NAMES: Record<HandleDirection, string> = {
  nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left',
}

function ResizeHandle({ direction, panelId, title }: { direction: HandleDirection; panelId: string; title: string }) {
  return usePart(
    board,
    'handle',
    { id: `${panelId}-${direction}`, box: panelId, handle: direction },
    {
      ...({ 'data-testid': `resize-handle-${direction}` } as Record<string, unknown>),
      type: 'button',
      'aria-label': `Resize ${title} ${HANDLE_NAMES[direction]}`,
      style: getHandleStyle(direction),
      className: 'rounded-sm focus-visible:bg-accent focus-visible:outline-none',
    },
    'button',
  )
}

/* ── Draggable panel ── */

interface DraggablePanelProps {
  board: BoardHandle
  panel: PanelItem
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

function DraggablePanel({ board: boardHandle, panel, stackOrder, zIndex, isFocused, isSelected, isDimmed, isFullscreen, canvasRef, onRemovePanel, renderPanel, getIcon, getLabel, renderHeaderActions }: DraggablePanelProps) {
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
    (e: React.PointerEvent) => boardHandle.api.move.pointerdown(e.nativeEvent, panel.id, e.currentTarget as HTMLElement),
    [boardHandle, panel.id],
  )

  const icon = panel.lensType ? getIcon?.(panel.lensType) : undefined
  const label = panel.title ?? (panel.lensType ? getLabel?.(panel.lensType) : undefined) ?? 'Untitled'
  const movable = !isFullscreen && !stacked

  const data: Record<string, unknown> = {
    'data-testid': `panel-${panel.id}`,
    'data-panel-id': panel.id,
    'data-stack-order': stacked ? stackOrder : undefined,
    'data-layout-top': stacked ? undefined : panel.pos_y,
    'data-layout-height': stacked ? undefined : panel.height,
  }
  return usePart(board, 'panel', { value: panel.id, stacked }, {
    ...data,
    className: 'rounded-widget border border-border-subtle',
    onPointerDown: handlePointerDown,
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    style: ({ dragging }) => ({
      ...(stacked
        ? { position: 'relative', order: stackOrder, flexShrink: 0, width: '100%', height: Math.max(panel.height, panel.constraints?.minHeight ?? 0) }
        : { zIndex }),
      backgroundColor: 'var(--color-surface-raised)',
      boxShadow: dragging
        ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 50%, transparent)'
        : isSelected
          ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 70%, transparent)'
          : (isFocused || isHovered) ? 'var(--shadow-panel-focused)' : 'var(--shadow-panel)',
      opacity: isDimmed ? 0.3 : 1,
      transition: dragging || stacked
        ? undefined
        : 'left var(--transition-panel), top var(--transition-panel), width var(--transition-panel), height var(--transition-panel), box-shadow var(--transition-panel), opacity var(--transition-panel)',
    }),
    children: (
      <>
        {movable && (
          <div
            style={{ pointerEvents: isHovered ? 'auto' : 'none' }}
            data-testid={`resize-handles-${panel.id}`}
          >
            {ALL_DIRECTIONS.map((dir) => (
              <ResizeHandle key={dir} direction={dir} panelId={panel.id} title={label} />
            ))}
          </div>
        )}
        <PanelChrome
          panelId={panel.id}
          title={label}
          icon={icon}
          onClose={handleClose}
          onDragHandlePointerDown={stacked ? undefined : onHeaderPointerDown}
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
