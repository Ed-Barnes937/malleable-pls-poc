import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { AnimatePresence, animate, frame as nextFrame, motion, useDragControls, useIsPresent, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { ENTER_FROM, MOTION_EASE, MOTION_EASE_BEZIER, MOTION_MS, MOTION_TIMING, Presence, boardSlideKeyframes, prefersReducedMotion, useReducedMotion } from '@pls/shared-ui'
import { useCanvasStore, clampDimensions, persistableLayout, LAYOUT_KEYS, type PanelItem } from './canvas-store'
import { useShiftKey } from './useShiftKey'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import { PanelChrome } from './PanelChrome'
import { clampToCanvas, resizeDimensions, anchoredPosition, PLACEMENT_GAP, STACK_BREAKPOINT } from './geometry'
import { scrollPanelIntoView } from './reveal'
import { boxOf, nudgeCovered, snapMove, snapResize, type Box, type CanvasView } from './layout'

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
  /**
   * The side a new set of panels (another board) slides in from, in the
   * direction of travel; null shows it in place (the first load).
   */
  slideFrom?: 'left' | 'right' | null
}

export function CanvasEngine({ onLayoutChange, onDragOver, onDrop, onRemovePanel, renderPanel, getIcon, getLabel, renderHeaderActions, slideFrom }: CanvasEngineProps) {
  const panels = useCanvasStore((s) => s.panels)
  const panelSet = useCanvasStore((s) => s.panelSet)
  const arranged = useCanvasStore((s) => s.arranged)
  const focusModePanelId = useCanvasStore((s) => s.focusModePanelId)
  const fullscreenPanelId = useCanvasStore((s) => s.fullscreenPanelId)
  const selectedPanelId = useCanvasStore((s) => s.selectedPanelId)
  const exitFocusMode = useCanvasStore((s) => s.exitFocusMode)
  const selectPanel = useCanvasStore((s) => s.selectPanel)
  const gesturePanelId = useCanvasStore((s) => s.gesturePanelId)
  // Letting go of Shift mid-gesture is back to free placement: no outline.
  // Pressing Shift mid-gesture shows where the widget would land at once;
  // letting go of it is back to free placement: no outline.
  const shiftRef = useShiftKey(useCallback((held: boolean) => {
    const state = useCanvasStore.getState()
    if (!held) state.setShiftPreview(null)
    else if (liveGesture && state.gesturePanelId === liveGesture.panelId) previewShift(liveGesture.panelId, liveGesture.snapped(), liveGesture.canvas)
  }, []))
  const canvasRef = useRef<HTMLDivElement>(null)

  // Activate keyboard shortcuts (] / [ cycle, f fullscreen, Backspace remove, Escape)
  useCanvasKeyboard({ onRemovePanel, canvasRef })

  // Compute max z_index to determine which panel is focused
  const maxZIndex = panels.length > 0
    ? Math.max(...panels.map((p) => p.z_index))
    : 0

  // The layout as last saved (or as loaded): a new panel set is the baseline,
  // read as it is set, so a layout arranged straight after (a migrated
  // board's Tidy up) is still saved.
  const saved = useRef<Map<string, SavedLayout> | null>(null)
  useLayoutEffect(() => {
    saved.current ??= savedLayouts(persistableLayout(useCanvasStore.getState()))
    return useCanvasStore.subscribe((state, prev) => {
      if (state.panelSet !== prev.panelSet) saved.current = savedLayouts(persistableLayout(state))
    })
  }, [])
  // Saved once a gesture ends, and only the widgets that moved. A widget
  // that is new to the board joins the baseline: adding it saved it.
  useEffect(() => {
    if (gesturePanelId) return
    const now = persistableLayout(useCanvasStore.getState())
    const was = saved.current ?? new Map()
    const moved = now.filter((p) => {
      const before = was.get(p.id)
      return before !== undefined && LAYOUT_KEYS.some((k) => Math.round(before[k]) !== Math.round(p[k]))
    })
    saved.current = savedLayouts(now)
    if (moved.length > 0) onLayoutChange?.(moved)
  }, [panels, gesturePanelId, onLayoutChange])

  const reducedMotion = useReducedMotion()

  // Another board's widgets slide in together (the board's background stays
  // put), before the browser paints them where they end up.
  const slidFor = useRef(panelSet)
  useLayoutEffect(() => {
    if (slidFor.current === panelSet) return
    slidFor.current = panelSet
    if (slideFrom && !reducedMotion) canvasRef.current?.animate(boardSlideKeyframes(slideFrom), MOTION_TIMING)
  }, [panelSet, slideFrom, reducedMotion])

  /** Each panel's element and motion values, for gliding it (see `glide`). */
  const gliders = useRef(new Map<string, Glider>())
  /** Where every panel was on screen just before the last arranging change. */
  const beforeArranged = useRef<ArrangedBefore | null>(null)
  /** The board's scroll as a panel went fullscreen, to put back as it leaves. */
  const scrollBeforeFullscreen = useRef<number | null>(null)
  // Read the old places as the change is made, before React redraws, and
  // the board's scroll before a panel goes fullscreen (once it has, the board
  // may be too short to keep it).
  useLayoutEffect(() => useCanvasStore.subscribe((state, prev) => {
    if (state.fullscreenPanelId && !prev.fullscreenPanelId && canvasRef.current) {
      scrollBeforeFullscreen.current = canvasRef.current.scrollTop
    }
    if (state.arranged === prev.arranged) return
    const boxes = new Map<string, DOMRect>()
    // The widget under the pointer is put down where it was dropped, never glided.
    for (const [id, g] of gliders.current) if (id !== state.gesturePanelId) boxes.set(id, g.el.getBoundingClientRect())
    beforeArranged.current = { boxes, sizes: new Map(prev.panels.map((p) => [p.id, { width: p.width, height: p.height }])) }
  }), [])

  // A fullscreen panel fills the canvas from its top-left, so show the top;
  // leaving fullscreen puts the board back where it was scrolled to. Then
  // every panel glides from where it was on screen, the board's scroll
  // included, so nothing jumps (and nothing moves under reduced motion).
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
    const before = beforeArranged.current
    beforeArranged.current = null
    if (before && !reducedMotion) glide(canvas, useCanvasStore.getState().panels, gliders.current, before)
  }, [fullscreenPanelId, arranged, reducedMotion])

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
      {/* Keyed by the panel set: another board's widgets are there at once
          (the canvas slides in as a whole, see slideFrom), while a widget added to
          or removed from this board arrives or leaves with the shared motion. */}
      <AnimatePresence key={panelSet} initial={false}>
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
          isBehind={!narrow && fullscreenPanelId !== null && fullscreenPanelId !== panel.id}
          reducedMotion={reducedMotion}
          gliders={gliders.current}
          canvasRef={canvasRef}
          onRemovePanel={onRemovePanel}
          renderPanel={renderPanel}
          getIcon={getIcon}
          getLabel={getLabel}
          renderHeaderActions={renderHeaderActions}
        />
      ))}
      </AnimatePresence>
      {/* Air under the lowest widget once the free board scrolls. */}
      {!narrow && panels.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 w-px"
          style={{ top: Math.max(...panels.map((p) => p.pos_y + p.height)), height: PLACEMENT_GAP }}
        />
      )}
      {!narrow && <ShiftOutline zIndex={maxZIndex + 2} reducedMotion={reducedMotion} />}
    </div>
  )
}

/**
 * Shift held mid-gesture: where the widget and anything it nudges will land.
 * Its own subscriber, so the outline following the pointer never redraws the
 * panels (the one being dragged included) on the way.
 */
function ShiftOutline({ zIndex, reducedMotion }: { zIndex: number; reducedMotion: boolean }) {
  const shiftPreview = useCanvasStore((s) => s.shiftPreview)
  return (
    <Presence>
      {shiftPreview && (
        <div aria-hidden className="pointer-events-none motion-safe:animate-enter" style={{ position: 'absolute', inset: 0, zIndex }}>
          {[shiftPreview.moving, ...shiftPreview.nudged].map((box, i) => (
            <div
              key={box.id}
              data-testid={i === 0 ? 'snap-outline' : 'snap-outline-nudge'}
              data-panel-for={box.id}
              className={`absolute rounded-widget border-2 border-dashed border-accent ${i === 0 ? 'bg-accent/10' : 'bg-accent/5'}`}
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                transition: reducedMotion ? undefined : OUTLINE_TRANSITION,
              }}
            />
          ))}
        </div>
      )}
    </Presence>
  )
}

const OUTLINE_TRANSITION = ['left', 'top', 'width', 'height'].map((p) => `${p} ${MOTION_MS}ms ${MOTION_EASE}`).join(', ')

/** What is saved of each panel's place, to tell which ones a change moved. */
type SavedLayout = Pick<PanelItem, (typeof LAYOUT_KEYS)[number]>

function savedLayouts(panels: ReadonlyArray<PanelItem>): Map<string, SavedLayout> {
  return new Map(panels.map((p) => [p.id, { pos_x: p.pos_x, pos_y: p.pos_y, width: p.width, height: p.height, z_index: p.z_index }]))
}

/** The part of the board in view, for placing a nudged widget. */
function viewOf(canvas: HTMLElement): CanvasView {
  return { width: canvas.clientWidth, height: canvas.clientHeight, top: canvas.scrollTop }
}

/** Shows where a Shift gesture will leave the widget at `box`, and what it nudges. */
function previewShift(panelId: string, box: Box, canvas: HTMLElement | null) {
  const state = useCanvasStore.getState()
  const nudges = canvas ? nudgeCovered(panelId, box, state.panels, viewOf(canvas)) : new Map()
  state.setShiftPreview({
    moving: { id: panelId, ...box },
    nudged: [...nudges].map(([id, at]) => {
      const p = state.panels.find((q) => q.id === id)!
      return { id, x: at.x, y: at.y, width: p.width, height: p.height }
    }),
  })
}

/** Puts down a Shift gesture's widget at `box`: whatever it covers glides to a free spot. */
/**
 * Puts down a Shift gesture's widget at `box`: whatever it covers glides to a
 * free spot. One sent below the fold is scrolled to once it has landed (the
 * topmost, when several were), so it never vanishes without a cue.
 */
function landShift(panelId: string, box: Box, canvas: HTMLElement | null) {
  liveGesture = null
  const state = useCanvasStore.getState()
  state.setShiftPreview(null)
  if (!canvas) return
  const nudges = nudgeCovered(panelId, box, state.panels, viewOf(canvas))
  state.arrangePanels(new Map([...nudges].map(([id, at]) => [id, { pos_x: at.x, pos_y: at.y }])))
  const topmost = [...nudges].sort(([, a], [, b]) => a.y - b.y || a.x - b.x)[0]?.[0]
  if (topmost) setTimeout(() => scrollPanelIntoView(canvas, topmost), prefersReducedMotion() ? 0 : MOTION_MS)
}

/**
 * The drag or resize under way, and where its widget would land with Shift
 * held, so pressing Shift mid-gesture shows the outline before the pointer
 * moves again. Set as the pointer moves, cleared as the gesture ends.
 */
let liveGesture: { panelId: string; snapped: () => Box; canvas: HTMLElement | null } | null = null

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

/* ── Gliding to a new arrangement ── */

/** A panel's element and the motion values that place and size it on screen. */
interface Glider {
  el: HTMLElement
  x: MotionValue<number>
  y: MotionValue<number>
  scaleX: MotionValue<number>
  scaleY: MotionValue<number>
  /** The panel's content (header and widget), apart from its card. */
  content: MotionValue<number>
  /** How far the content is drawn at its own size rather than scaled with the card (0 to 1). */
  unscale: MotionValue<number>
}

/** How far through a resize glide the content is hidden, then shown (see `glide`). */
const CONTENT_HIDDEN_UNTIL = 0.2
const CONTENT_SHOWN_BY = 0.5

/** Panels scale from their top edge's middle (enter, leave, step back, glide). */
const ORIGIN = { x: 0.5, y: 0 }
const PANEL_ORIGIN = `${ORIGIN.x * 100}% ${ORIGIN.y * 100}%`

/**
 * After an arranging change (fullscreen in or out, Tidy up), each panel is
 * laid out at its new box at once, and drawn from where it was on screen
 * (`before`) back to that box: a transform only, so nothing on the page is
 * laid out again while it glides. A panel whose box didn't change still
 * glides if the board's scroll moved under it. A panel changing size lays its
 * content out afresh for the new size at once, so it is hidden for the
 * glide's first frames (while it is laid out, and nothing is seen to jump),
 * then fades in by halfway, drawn at its own size (scaled against the card,
 * so it never stretches with it) and clipped by the card. Motion/react owns
 * these values (one engine per element).
 */
function glide(
  canvas: HTMLElement,
  panels: ReadonlyArray<PanelItem>,
  gliders: ReadonlyMap<string, Glider>,
  before: ArrangedBefore,
) {
  const frame = canvas.getBoundingClientRect()
  const options = { type: 'tween' as const, duration: MOTION_MS / 1000, ease: MOTION_EASE_BEZIER }
  for (const panel of panels) {
    const g = gliders.get(panel.id)
    const was = before.boxes.get(panel.id)
    const size = before.sizes.get(panel.id)
    if (!g || !was || !size || panel.width <= 0 || panel.height <= 0) continue
    // Where its new box is on screen (the layout, not a transform in flight).
    const left = frame.left + canvas.clientLeft + panel.pos_x - canvas.scrollLeft
    const top = frame.top + canvas.clientTop + panel.pos_y - canvas.scrollTop
    if (size.width !== panel.width || size.height !== panel.height) {
      // Drawn at its old size and place, then grown or shrunk into the new.
      const sx = was.width / panel.width
      const sy = was.height / panel.height
      animate(g.x, [was.left - left - ORIGIN.x * panel.width * (1 - sx), 0], options)
      animate(g.y, [was.top - top - ORIGIN.y * panel.height * (1 - sy), 0], options)
      animate(g.scaleX, [sx, 1], options)
      animate(g.scaleY, [sy, 1], options)
      animate(g.content, [0, 0, 1, 1], { duration: MOTION_MS / 1000, times: [0, CONTENT_HIDDEN_UNTIL, CONTENT_SHOWN_BY, 1], ease: 'easeOut' })
      g.unscale.jump(0)
      nextFrame.render(() => nextFrame.render(() => g.unscale.set(1)))
      continue
    }
    // Same size: only moved (or the board scrolled under it). Measured by the
    // middle of its top edge, which a panel stepping back keeps (see ORIGIN).
    const dx = was.left + was.width / 2 - (left + panel.width / 2)
    const dy = was.top - top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
    animate(g.x, [dx, 0], options)
    animate(g.y, [dy, 0], options)
  }
}

/** The panels just before an arranging change: on screen, and their sizes in the store. */
interface ArrangedBefore {
  boxes: ReadonlyMap<string, DOMRect>
  sizes: ReadonlyMap<string, { width: number; height: number }>
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
      useCanvasStore.getState().setGesture(panelId)
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
    },
    [panelId, bringToFront, onGestureChange],
  )

  /** The box this pointer event resizes the panel to (snapped with Shift held). */
  const boxAt = useCallback(
    (e: React.PointerEvent, shift: boolean): Box | null => {
      if (!startRef.current) return null
      const { startX, startY, panelX, panelY, panelW, panelH } = startRef.current
      const axes = HANDLE_AXES[direction]
      const delta = { x: e.clientX - startX, y: e.clientY - startY }
      const { w: newW, h: newH } = resizeDimensions({ w: panelW, h: panelH }, axes, delta)
      const panel = useCanvasStore.getState().panels.find((p) => p.id === panelId)
      const clamped = clampDimensions(newW, newH, panel?.constraints)
      const { x: newX, y: newY } = anchoredPosition(
        { x: panelX, y: panelY, w: panelW, h: panelH },
        axes,
        clamped.width,
        clamped.height,
      )
      const box = { x: newX, y: newY, width: clamped.width, height: clamped.height }
      if (!shift) return box
      const canvas = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-canvas-scroll]')
      return snapResize(box, axes, panel?.constraints, canvas?.clientWidth ?? Infinity)
    },
    [direction, panelId],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      e.stopPropagation()
      const shift = shiftRef.current
      const box = boxAt(e, shift)
      if (!box) return
      const canvas = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-canvas-scroll]')
      const snapped = shift ? box : boxAt(e, true)
      liveGesture = { panelId, snapped: () => snapped ?? box, canvas }
      resizePanel(panelId, box.x, box.y, box.width, box.height)
      if (shift) previewShift(panelId, box, canvas)
      else useCanvasStore.getState().setShiftPreview(null)
    },
    [boxAt, panelId, resizePanel, shiftRef],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      e.stopPropagation()
      if (e.shiftKey) {
        const current = useCanvasStore.getState().panels.find((p) => p.id === panelId)
        if (current) landShift(panelId, boxOf(current), (e.currentTarget as HTMLElement).closest('[data-canvas-scroll]'))
      }
      startRef.current = null
      liveGesture = null
      onGestureChange(false)
      useCanvasStore.getState().setGesture(null)
      const target = e.currentTarget as HTMLElement
      if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId)
    },
    [onGestureChange, panelId],
  )

  return (
    <div
      data-testid={`resize-handle-${direction}`}
      style={getHandleStyle(direction)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}

/* ── Drag hook ── */

/** Exported for its tests. */
export function usePanelDrag(
  panel: PanelItem,
  opts: {
    shiftRef: React.RefObject<boolean>
    canvasRef: React.RefObject<HTMLDivElement | null>
    isFullscreen: boolean
    /** A gesture starts: any glide in flight stops (see `glide`). */
    onSettle: () => void
  },
) {
  const movePanel = useCanvasStore((s) => s.movePanel)
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [isGesturing, setIsGesturing] = useState(false)
  const { shiftRef, canvasRef, isFullscreen, onSettle } = opts
  /**
   * Where a glide had the panel as a drag took it (0 when none was in
   * flight): the drag carries on from there, so it never jumps by the rest
   * of the glide.
   */
  const glideLeft = useRef({ x: 0, y: 0 })

  // A resize works from the panel's laid-out box: the glide jumps to its end.
  const onGestureChange = useCallback((active: boolean) => {
    if (active) {
      onSettle()
      x.jump(0)
      y.jump(0)
    }
    setIsGesturing(active)
  }, [onSettle, x, y])

  /** A drag is under way (between onDragStart and onDragEnd). */
  const dragging = useRef(false)

  /**
   * Where the panel was drawn as the header was pressed: motion/react moves
   * it from there by the pointer's offset before onDragStart runs (a frame
   * later), so a quick first move is never counted twice.
   */
  const pressedAt = useRef<{ x: number; y: number } | null>(null)

  const onDragStart = useCallback(() => {
    onSettle()
    x.stop()
    y.stop()
    glideLeft.current = pressedAt.current ?? { x: x.get(), y: y.get() }
    pressedAt.current = null
    dragging.current = true
    useCanvasStore.getState().setGesture(panel.id)
    setIsGesturing(true)
  }, [onSettle, x, y, panel.id])

  /**
   * Where the drag has the panel: free (on the canvas by at least a corner),
   * or with Shift held on the grid and wholly on the canvas across.
   */
  const dropBox = useCallback(
    (current: PanelItem, offset: { x: number; y: number }, shift: boolean): Box => {
      const box = { x: current.pos_x + glideLeft.current.x + offset.x, y: current.pos_y + glideLeft.current.y + offset.y, width: current.width, height: current.height }
      const canvas = canvasRef.current
      if (!canvas) return box
      if (shift) return snapMove(box, canvas.clientWidth)
      const clamped = clampToCanvas(
        box,
        box,
        { width: canvas.clientWidth, height: Math.max(canvas.clientHeight, canvas.scrollHeight) },
      )
      return { ...box, ...clamped }
    },
    [canvasRef],
  )

  const onDrag = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
      if (!current) return
      const shift = shiftRef.current
      const box = dropBox(current, info.offset, shift)
      const offset = info.offset
      liveGesture = { panelId: panel.id, snapped: () => dropBox(current, offset, true), canvas: canvasRef.current }
      x.set(box.x - current.pos_x)
      y.set(box.y - current.pos_y)
      if (shift) previewShift(panel.id, box, canvasRef.current)
      else if (useCanvasStore.getState().shiftPreview) useCanvasStore.getState().setShiftPreview(null)
    },
    [panel.id, shiftRef, x, y, canvasRef, dropBox],
  )

  const onDragEnd = useCallback(
    (event: PointerEvent | MouseEvent | TouchEvent, info: { offset: { x: number; y: number } }) => {
      const current = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
      liveGesture = null
      if (!current) {
        dragging.current = false
        useCanvasStore.getState().setGesture(null)
        return
      }
      dragging.current = false
      // As the button came up: this runs a frame later, when Shift may be let go already.
      const shift = 'shiftKey' in event ? event.shiftKey : shiftRef.current
      const box = dropBox(current, info.offset, shift)
      glideLeft.current = { x: 0, y: 0 }

      x.jump(0)
      y.jump(0)
      movePanel(panel.id, box.x, box.y)
      if (shift) landShift(panel.id, box, canvasRef.current)
      // The gesture (and so the save) ends with the widget, and anything it nudged, put down.
      useCanvasStore.getState().setGesture(null)
      requestAnimationFrame(() => setIsGesturing(false))
    },
    [panel.id, movePanel, x, y, shiftRef, canvasRef, dropBox],
  )

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isFullscreen) return
      // The gesture starts as the header is pressed, so a press that becomes
      // a drag (raising the widget included) saves once, at its end. Who ends
      // it depends on whether a drag started:
      // - a drag: motion/react calls onDragStart (setting `dragging`) once
      //   the pointer has moved a few pixels, and onDragEnd as the button
      //   comes up, which ends the gesture;
      // - a press that never moved that far: no onDragEnd comes, so the
      //   button coming up (window, capture phase) ends it a frame later,
      //   unless a drag is under way by then (`dragging`). The frame's wait
      //   lets a drag's onDragEnd, which motion/react may run a frame late,
      //   go first.
      const store = useCanvasStore.getState()
      store.setGesture(panel.id)
      const release = () => {
        window.removeEventListener('pointerup', release, true)
        window.removeEventListener('pointercancel', release, true)
        // A drag in progress ends in onDragEnd, after this.
        requestAnimationFrame(() => {
          if (!dragging.current && useCanvasStore.getState().gesturePanelId === panel.id) useCanvasStore.getState().setGesture(null)
        })
      }
      window.addEventListener('pointerup', release, true)
      window.addEventListener('pointercancel', release, true)
      // Starting the drag stops a glide in flight: it carries on from there.
      dragControls.start(e)
      pressedAt.current = { x: x.get(), y: y.get() }
    },
    [dragControls, isFullscreen, panel.id, x, y],
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
  /** Another panel is fullscreen: this one steps back behind it. */
  isBehind?: boolean
  /** The student asked for less motion: nothing arrives, leaves or glides, it just is. */
  reducedMotion?: boolean
  /** Where the canvas finds this panel's motion values to glide it (see `glide`). */
  gliders?: Map<string, Glider>
  canvasRef?: React.RefObject<HTMLDivElement | null>
  onRemovePanel?: (panelId: string) => void
  renderPanel?: (panelId: string) => ReactNode
  getIcon?: (lensType: string) => ComponentType<{ className?: string }> | undefined
  getLabel?: (lensType: string) => string | undefined
  renderHeaderActions?: (panelId: string) => ReactNode
}

function DraggablePanel({ panel, shiftRef, stackOrder, zIndex, isFocused, isSelected, isDimmed, isFullscreen, isBehind, reducedMotion, gliders, canvasRef, onRemovePanel, renderPanel, getIcon, getLabel, renderHeaderActions }: DraggablePanelProps) {
  const stacked = stackOrder !== undefined
  // Removed and leaving: still drawn for its exit, but no longer on the board.
  const present = useIsPresent()
  const elRef = useRef<HTMLDivElement>(null)
  const scaleX = useMotionValue(1)
  const scaleY = useMotionValue(1)
  const content = useMotionValue(1)
  const unscale = useMotionValue(1)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const removePanel = useCanvasStore((s) => s.removePanel)
  const toggleFullscreen = useCanvasStore((s) => s.toggleFullscreen)
  const [isHovered, setIsHovered] = useState(false)

  // A gesture during a glide stops it: the card takes its own size at once.
  const settle = useCallback(() => {
    for (const v of [scaleX, scaleY, content]) v.stop()
    scaleX.jump(1)
    scaleY.jump(1)
    content.jump(1)
    unscale.jump(1)
  }, [scaleX, scaleY, content, unscale])
  const { x, y, isGesturing, onGestureChange, dragControls, onDragStart, onDrag, onDragEnd, onDragHandlePointerDown } =
    usePanelDrag(panel, { shiftRef, canvasRef: canvasRef ?? { current: null }, isFullscreen: isFullscreen ?? false, onSettle: settle })
  // The content against the card's scale, so it is drawn at its own size as the card glides.
  const contentScaleX = useTransform(() => 1 + (1 / scaleX.get() - 1) * unscale.get())
  const contentScaleY = useTransform(() => 1 + (1 / scaleY.get() - 1) * unscale.get())

  useLayoutEffect(() => {
    const el = elRef.current
    if (!gliders || !el || !present) return
    gliders.set(panel.id, { el, x, y, scaleX, scaleY, content, unscale })
    return () => { gliders.delete(panel.id) }
  }, [gliders, panel.id, present, x, y, scaleX, scaleY, content, unscale])

  // What it showed last while on the board, kept for its exit (its data may already be gone).
  const lastContent = useRef<ReactNode>(null)
  if (present) lastContent.current = renderPanel?.(panel.id)

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

  // Only the shadow eases in CSS: where the panel is and how it fades are
  // motion/react's (arrive, leave, dim, glide), never a CSS transition, so
  // the two never fight over a value. No shadow easing while gesturing or
  // stacked (switching layouts should snap).
  const transitionStyle = isGesturing || stacked || reducedMotion ? undefined : 'box-shadow var(--transition-panel)'
  const motionTiming = reducedMotion
    ? { duration: 0 }
    : { type: 'tween' as const, duration: MOTION_MS / 1000, ease: MOTION_EASE_BEZIER }
  // Arrives from, and leaves to, the shared starting look (a slide would take
  // the drag's `y`, so the scale from its top edge does the travelling).
  const away = { opacity: ENTER_FROM.opacity, scale: ENTER_FROM.scale }

  const icon = panel.lensType ? getIcon?.(panel.lensType) : undefined
  const label = panel.title ?? (panel.lensType ? getLabel?.(panel.lensType) : undefined) ?? 'Untitled'

  return (
    <motion.div
      ref={elRef}
      data-testid={present ? `panel-${panel.id}` : undefined}
      data-panel-id={present ? panel.id : undefined}
      data-leaving={present ? undefined : ''}
      // Nothing to reach while it leaves, or while it steps back behind a fullscreen panel.
      inert={!present || isBehind || undefined}
      aria-hidden={present ? undefined : true}
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
        transition: transitionStyle,
        transformOrigin: PANEL_ORIGIN,
        // Nothing to press while it steps back behind a fullscreen panel.
        pointerEvents: isBehind ? 'none' : undefined,
        x,
        y,
        scaleX,
        scaleY,
      }}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="rounded-widget border border-border-subtle"
      initial={reducedMotion ? false : away}
      animate={{
        opacity: isBehind ? 0 : isDimmed ? 0.3 : 1,
        scale: isGesturing ? 1.015 : isBehind ? ENTER_FROM.scale : 1,
      }}
      exit={reducedMotion ? undefined : away}
      transition={motionTiming}
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

      {/* Clips the content to the card while the card glides (see `glide`). */}
      <div className="h-full w-full overflow-hidden rounded-widget">
      <motion.div className="h-full w-full" style={{ opacity: content, scaleX: contentScaleX, scaleY: contentScaleY, transformOrigin: PANEL_ORIGIN }}>
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
        {lastContent.current}
      </PanelChrome>
      </motion.div>
      </div>
    </motion.div>
  )
}
