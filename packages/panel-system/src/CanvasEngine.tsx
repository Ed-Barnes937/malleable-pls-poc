import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { AnimatePresence, animate, frame as nextFrame, motion, useIsPresent, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { usePart, usePrimitive, type PrimitiveHandle } from '@ui-sdk/react/primitive'
import { ENTER_FROM, MOTION_EASE, MOTION_EASE_BEZIER, MOTION_MS, MOTION_TIMING, Presence, boardSlideKeyframes, prefersReducedMotion, useReducedMotion } from '@pls/shared-ui'
import { useCanvasStore, clampDimensions, persistableLayout, LAYOUT_KEYS, type PanelItem } from './canvas-store'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import { PanelChrome } from './PanelChrome'
import { PLACEMENT_GAP, STACK_BREAKPOINT } from './geometry'
import { panelBoard, type PanelBoardCommit } from './panel-board'
import { scrollPanelIntoView } from './reveal'
import { nudgeCovered, snapMove, snapResize, type Box, type CanvasView } from './layout'
import type { ResizeHandle as BoardHandleName } from '@ui-sdk/core'

type BoardHandle = PrimitiveHandle<typeof panelBoard>
type BoardState = BoardHandle['state']

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
  const canvasRef = useRef<HTMLDivElement>(null)
  const { narrow, size: canvasSize } = useCanvasSize(canvasRef)
  const reducedMotion = useReducedMotion()

  /** Each panel's element and motion values, for gliding it (see `glide`). */
  const gliders = useRef(new Map<string, Glider>())
  /** Where every panel was on screen just before the last arranging change. */
  const beforeArranged = useRef<ArrangedBefore | null>(null)
  /** Records where every panel is on screen now (but `except`), so the next layout glides from there. */
  const captureBefore = useCallback((panelsNow: ReadonlyArray<PanelItem>, except: string | null) => {
    const boxes = new Map<string, DOMRect>()
    for (const [id, g] of gliders.current) if (id !== except) boxes.set(id, g.el.getBoundingClientRect())
    beforeArranged.current = { boxes, sizes: new Map(panelsNow.map((p) => [p.id, { width: p.width, height: p.height }])) }
  }, [])

  // Holding Shift while dragging or resizing a widget shows where it lands
  // (on the grid, wholly on the canvas) and what it nudges out of the way.
  const updateShiftPreview = useRef<() => void>(() => {})
  const shiftRef = useShiftHeld(useCallback(() => updateShiftPreview.current(), []))

  /* ── Moving and resizing (UI SDK createMove / createResize) ── */

  const panelById = (key: string) => useCanvasStore.getState().panels.find((p) => p.id === key)
  /** The board's width as last measured (none yet: unbounded). */
  const canvasWidth = useCallback(() => canvasSize.current.width || Infinity, [canvasSize])

  /** Why the panels last changed through the board, read by the save below. */
  const lastCommitRef = useRef<PanelBoardCommit['reason'] | null>(null)
  const onCommit = useCallback(({ boxes, reason, snapped }: PanelBoardCommit) => {
    const store = useCanvasStore.getState()
    const { panels: current, movePanel, resizePanel } = store
    // A key press glides the panel to its new box, as an arranging change does.
    if (reason === 'move-key' || reason === 'resize-key') captureBefore(current, null)
    let landed: { id: string; box: Box } | null = null
    for (const p of current) {
      const b = boxes[p.id]
      if (!b) continue
      const glider = gliders.current.get(p.id)
      if (b.width !== p.width || b.height !== p.height) {
        lastCommitRef.current = reason
        resizePanel(p.id, b.x, b.y, b.width, b.height)
        landed = { id: p.id, box: b }
      } else if (b.x !== p.pos_x || b.y !== p.pos_y) {
        lastCommitRef.current = reason
        // A drag that started mid-glide carries on from where the glide had it
        // (on the grid again, for a snapped drop).
        let box: Box = b
        if (glider?.carry) {
          const carried = { ...b, x: Math.round(b.x + glider.carry.x), y: Math.round(b.y + glider.carry.y) }
          box = snapped ? snapMove(carried, canvasWidth()) : carried
          glider.carry = null
          glider.x.jump(0)
          glider.y.jump(0)
        }
        movePanel(p.id, box.x, box.y)
        landed = { id: p.id, box }
      }
    }
    if (snapped && landed) landShift(landed.id, landed.box, canvasRef.current)
    else store.setShiftPreview(null)
  }, [captureBefore, canvasWidth])
  const boxes = useMemo(
    () => Object.fromEntries(panels.map((p) => [p.id, { x: p.pos_x, y: p.pos_y, width: p.width, height: p.height }])),
    [panels],
  )
  const board = usePrimitive(panelBoard, {
    boxes,
    onCommit,
    // Measured by an observer, not read from the element here: a layout read
    // while a drop commits would show the panel back at its old spot for a
    // frame, then slide it over. The board's scroll height is its lowest panel
    // plus the air under it.
    canvas: () => {
      const { width, height } = canvasSize.current
      const lowest = Math.max(0, ...useCanvasStore.getState().panels.map((p) => p.pos_y + p.height))
      return { width, height: Math.max(height, lowest + PLACEMENT_GAP) }
    },
    // Stacked, nothing moves; while a widget fills the board, the others are out of sight.
    disabled: () => narrow || useCanvasStore.getState().fullscreenPanelId !== null,
    min: (key) => clampDimensions(0, 0, panelById(key)?.constraints),
    max: (key) => clampDimensions(Infinity, Infinity, panelById(key)?.constraints),
    label: (key) => {
      const panel = panelById(key)
      return panel ? panelLabel(panel, getLabel) : undefined
    },
    // Placement is free; Shift snaps a drag to the grid, wholly on the board
    // and `PLACEMENT_GAP` from its edges.
    shift: () => shiftRef.current,
    snapBox: (key, box, handle) =>
      handle === 'move'
        ? snapMove(box, canvasWidth())
        : snapResize(box, handleAxes(handle), panelById(key)?.constraints, canvasWidth()),
  })
  const onMoveKey = useCallback((e: KeyboardEvent, panelId: string) => board.api.move.keydown(e, panelId), [board])

  /** The widget a pointer is moving or resizing on the board, if any. */
  const draftOf = (state: BoardState) => state.moving?.keys[0] ?? state.resizing?.key

  updateShiftPreview.current = () => {
    const store = useCanvasStore.getState()
    const state = board.instance.get() as BoardState
    const id = draftOf(state)
    const box = id ? board.api.preview(state, id) : undefined
    if (!id || !box || !shiftRef.current || narrow) {
      if (store.shiftPreview) store.setShiftPreview(null)
      return
    }
    // The board's preview is already snapped while Shift is held.
    previewShift(id, box, canvasRef.current)
  }

  // The outline follows the widget as the board moves or resizes it (each
  // change to the board's draft, so it is never a pointer move behind).
  useEffect(() => board.instance.subscribe(() => {
    if (draftOf(board.instance.get() as BoardState)) updateShiftPreview.current()
  }), [board])
  // Escape puts a dragged widget back: it glides there, and the outline goes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !draftOf(board.instance.get() as BoardState)) return
      captureBefore(useCanvasStore.getState().panels, null)
      useCanvasStore.getState().setShiftPreview(null)
      requestAnimationFrame(() => runGlide())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  /**
   * A press on a widget's header or a handle starts a gesture: the board
   * saves once it ends, so raising the widget and moving it save together.
   * It ends as the button comes up, once the board has committed the drop
   * (the window hears it last); a frame later at the latest, should
   * something on the way stop the event.
   */
  const beginGesture = useCallback((panelId: string) => {
    useCanvasStore.getState().setGesture(panelId)
    const end = () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('pointerup', endSoon, true)
      window.removeEventListener('pointercancel', endSoon, true)
      // A drag that started mid-glide and never moved: the glide finishes.
      const g = gliders.current.get(panelId)
      if (g?.carry) {
        g.carry = null
        animate(g.x, 0, glideOptions)
        animate(g.y, 0, glideOptions)
      }
      if (useCanvasStore.getState().gesturePanelId === panelId) useCanvasStore.getState().setGesture(null)
    }
    const endSoon = () => requestAnimationFrame(end)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('pointerup', endSoon, true)
    window.addEventListener('pointercancel', endSoon, true)
  }, [])

  // Activate keyboard shortcuts (] / [ cycle, f fullscreen, Backspace remove, Escape, Alt+arrow move)
  useCanvasKeyboard({ onRemovePanel, canvasRef, onMoveKey })

  const onLayoutChangeRef = useRef(onLayoutChange)
  useLayoutEffect(() => {
    onLayoutChangeRef.current = onLayoutChange
  })
  /** A keyboard move or resize waiting for the keys to stop before it is saved. */
  const pendingSaveRef = useRef<{ layout: PanelItem[]; timer: ReturnType<typeof setTimeout> } | null>(null)
  const flushPendingSave = useCallback(() => {
    const pending = pendingSaveRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingSaveRef.current = null
    onLayoutChangeRef.current?.(pending.layout)
  }, [])

  // Compute max z_index to determine which panel is focused
  const maxZIndex = panels.length > 0
    ? Math.max(...panels.map((p) => p.z_index))
    : 0

  // The layout as last saved (or as loaded): a new panel set is the baseline,
  // read as it is set, so a layout arranged straight after (a migrated
  // board's Tidy up) is still saved. A keyboard change still waiting to be
  // saved belongs to the board being left: it is saved first.
  const saved = useRef<Map<string, SavedLayout> | null>(null)
  useLayoutEffect(() => {
    saved.current ??= savedLayouts(persistableLayout(useCanvasStore.getState()))
    return useCanvasStore.subscribe((state, prev) => {
      if (state.panelSet === prev.panelSet) return
      flushPendingSave()
      saved.current = savedLayouts(persistableLayout(state))
    })
  }, [flushPendingSave])
  // Saved once a gesture ends, and only the widgets that moved. A widget
  // that is new to the board joins the baseline: adding it saved it. A run
  // of key presses saves once the keys stop.
  useEffect(() => {
    if (gesturePanelId) return
    const now = persistableLayout(useCanvasStore.getState())
    const was = saved.current ?? new Map()
    const moved = now.filter((p) => {
      const before = was.get(p.id)
      return before !== undefined && LAYOUT_KEYS.some((k) => Math.round(before[k]) !== Math.round(p[k]))
    })
    saved.current = savedLayouts(now)
    const reason = lastCommitRef.current
    lastCommitRef.current = null
    if (moved.length === 0) return
    const pending = pendingSaveRef.current
    if (pending) clearTimeout(pending.timer)
    pendingSaveRef.current = null
    const layout = pending ? mergeById(pending.layout, moved) : moved
    if (reason === 'move-key' || reason === 'resize-key') {
      pendingSaveRef.current = { layout, timer: setTimeout(flushPendingSave, KEY_SAVE_DELAY) }
      return
    }
    onLayoutChange?.(layout)
  }, [panels, gesturePanelId, onLayoutChange, flushPendingSave])

  // Leaving the board doesn't drop a keyboard change still waiting to be saved.
  useEffect(() => flushPendingSave, [flushPendingSave])

  // Another board's widgets slide in together (the board's background stays
  // put), before the browser paints them where they end up.
  const slidFor = useRef(panelSet)
  useLayoutEffect(() => {
    if (slidFor.current === panelSet) return
    slidFor.current = panelSet
    if (slideFrom && !reducedMotion) canvasRef.current?.animate(boardSlideKeyframes(slideFrom), MOTION_TIMING)
  }, [panelSet, slideFrom, reducedMotion])

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
    // The widget under the pointer is put down where it was dropped, never glided.
    captureBefore(prev.panels, state.gesturePanelId)
  }), [captureBefore])

  /** Glides every panel from where `captureBefore` saw it to where it is laid out now. */
  const runGlide = useCallback(() => {
    const canvas = canvasRef.current
    const before = beforeArranged.current
    beforeArranged.current = null
    if (canvas && before && !prefersReducedMotion()) glide(canvas, useCanvasStore.getState().panels, gliders.current, before)
  }, [])

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
    runGlide()
  }, [fullscreenPanelId, arranged, panels, runGlide])

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
        {/* Keyed by the panel set: another board's widgets are there at once
            (the canvas slides in as a whole, see slideFrom), while a widget added to
            or removed from this board arrives or leaves with the shared motion. */}
        <AnimatePresence key={panelSet} initial={false}>
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
              isBehind={!narrow && fullscreenPanelId !== null && fullscreenPanelId !== panel.id}
              reducedMotion={reducedMotion}
              gliders={gliders.current}
              beginGesture={beginGesture}
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
      </>
    ),
  }, 'div')
}

/** Which edges a handle moves: -1 the left (top) one, 1 the right (bottom) one. */
function handleAxes(handle: BoardHandleName): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } {
  return {
    dx: handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0,
    dy: handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0,
  }
}

/** `next` over `base`, by panel id (the later place of a panel wins). */
function mergeById(base: ReadonlyArray<PanelItem>, next: ReadonlyArray<PanelItem>): PanelItem[] {
  const ids = new Set(next.map((p) => p.id))
  return [...base.filter((p) => !ids.has(p.id)), ...next]
}

/**
 * Whether Shift is held, as a ref (not state) so reading it while the pointer
 * moves doesn't re-render. `onChange` hears each press and release (and a
 * release when the window loses focus). Kept current by pointer events too,
 * which carry the key's state, so one pressed before the page had focus (or
 * before this mounted) still counts. Exported for its tests.
 */
export function useShiftHeld(onChange?: (held: boolean) => void): React.RefObject<boolean> {
  const shiftRef = useRef(false)
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const update = (held: boolean) => {
      if (shiftRef.current === held) return
      shiftRef.current = held
      onChangeRef.current?.(held)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') update(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') update(false)
    }
    const handleBlur = () => update(false)
    const handlePointer = (e: PointerEvent) => update(e.shiftKey)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('pointerdown', handlePointer, true)
    window.addEventListener('pointermove', handlePointer, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('pointerdown', handlePointer, true)
      window.removeEventListener('pointermove', handlePointer, true)
    }
  }, [])

  return shiftRef
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

/**
 * Puts down a Shift gesture's widget at `box`: whatever it covers glides to a
 * free spot. One sent below the fold is scrolled to once it has landed (the
 * topmost, when several were), so it never vanishes without a cue.
 */
function landShift(panelId: string, box: Box, canvas: HTMLElement | null) {
  const state = useCanvasStore.getState()
  state.setShiftPreview(null)
  if (!canvas) return
  const nudges = nudgeCovered(panelId, box, state.panels, viewOf(canvas))
  state.arrangePanels(new Map([...nudges].map(([id, at]) => [id, { pos_x: at.x, pos_y: at.y }])))
  const topmost = [...nudges].sort(([, a], [, b]) => a.y - b.y || a.x - b.x)[0]?.[0]
  if (topmost) setTimeout(() => scrollPanelIntoView(canvas, topmost), prefersReducedMotion() ? 0 : MOTION_MS)
}

/* ── Narrow layout ── */

export { STACK_BREAKPOINT }

/** Whether the canvas is narrow enough to stack, and its size (kept current in a ref). */
function useCanvasSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [narrow, setNarrow] = useState(false)
  const size = useRef({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      size.current = { width: el.clientWidth, height: el.clientHeight }
      setNarrow(el.clientWidth > 0 && el.clientWidth < STACK_BREAKPOINT)
    }
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return { narrow, size }
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
  /**
   * Where a glide had the panel as a drag took it: the panel stays there
   * while dragged, and the drop lands it from there, so it never jumps by
   * the rest of the glide.
   */
  carry: { x: number; y: number } | null
}

/** How far through a resize glide the content is hidden, then shown (see `glide`). */
const CONTENT_HIDDEN_UNTIL = 0.2
const CONTENT_SHOWN_BY = 0.5

/** Panels scale from their top edge's middle (enter, leave, step back, glide). */
const ORIGIN = { x: 0.5, y: 0 }
const PANEL_ORIGIN = `${ORIGIN.x * 100}% ${ORIGIN.y * 100}%`

const glideOptions = { type: 'tween' as const, duration: MOTION_MS / 1000, ease: MOTION_EASE_BEZIER }

/**
 * After an arranging change (fullscreen in or out, Tidy up, a Shift nudge, a
 * key press, Escape putting a dragged panel back), each panel is laid out at
 * its new box at once, and drawn from where it was on screen (`before`) back
 * to that box: a transform only, so nothing on the page is laid out again
 * while it glides. A panel whose box didn't change still glides if the
 * board's scroll moved under it. A panel changing size lays its content out
 * afresh for the new size at once, so it is hidden for the glide's first
 * frames (while it is laid out, and nothing is seen to jump), then fades in
 * by halfway, drawn at its own size (scaled against the card, so it never
 * stretches with it) and clipped by the card. Motion/react owns these values
 * (one engine per element).
 */
function glide(
  canvas: HTMLElement,
  panels: ReadonlyArray<PanelItem>,
  gliders: ReadonlyMap<string, Glider>,
  before: ArrangedBefore,
) {
  const frame = canvas.getBoundingClientRect()
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
      animate(g.x, [was.left - left - ORIGIN.x * panel.width * (1 - sx), 0], glideOptions)
      animate(g.y, [was.top - top - ORIGIN.y * panel.height * (1 - sy), 0], glideOptions)
      animate(g.scaleX, [sx, 1], glideOptions)
      animate(g.scaleY, [sy, 1], glideOptions)
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
    animate(g.x, [dx, 0], glideOptions)
    animate(g.y, [dy, 0], glideOptions)
  }
}

/** The panels just before an arranging change: on screen, and their sizes in the store. */
interface ArrangedBefore {
  boxes: ReadonlyMap<string, DOMRect>
  sizes: ReadonlyMap<string, { width: number; height: number }>
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
function ResizeHandle({ board, direction, panelId, title, tabStop, onGestureStart }: {
  board: BoardHandle
  direction: HandleDirection
  panelId: string
  title: string
  tabStop: boolean
  onGestureStart: () => void
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
      onPointerDown: onGestureStart,
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
  /** Another panel is fullscreen: this one steps back behind it. */
  isBehind?: boolean
  /** The student asked for less motion: nothing arrives, leaves or glides, it just is. */
  reducedMotion?: boolean
  /** Where the canvas finds this panel's motion values to glide it (see `glide`). */
  gliders?: Map<string, Glider>
  /** A press on the header or a handle starts a gesture (saved once it ends). */
  beginGesture: (panelId: string) => void
  canvasRef?: React.RefObject<HTMLDivElement | null>
  onRemovePanel?: (panelId: string) => void
  renderPanel?: (panelId: string) => ReactNode
  getIcon?: (lensType: string) => ComponentType<{ className?: string }> | undefined
  getLabel?: (lensType: string) => string | undefined
  renderHeaderActions?: (panelId: string) => ReactNode
}

function DraggablePanel({ board, panel, stackOrder, zIndex, isFocused, isSelected, isDimmed, isFullscreen, isBehind, reducedMotion, gliders, beginGesture, canvasRef, onRemovePanel, renderPanel, getIcon, getLabel, renderHeaderActions }: DraggablePanelProps) {
  const stacked = stackOrder !== undefined
  // Removed and leaving: still drawn for its exit, but no longer on the board.
  const present = useIsPresent()
  const elRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const scaleX = useMotionValue(1)
  const scaleY = useMotionValue(1)
  const content = useMotionValue(1)
  const unscale = useMotionValue(1)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const removePanel = useCanvasStore((s) => s.removePanel)
  const toggleFullscreen = useCanvasStore((s) => s.toggleFullscreen)
  const [isHovered, setIsHovered] = useState(false)
  // The content against the card's scale, so it is drawn at its own size as the card glides.
  const contentScaleX = useTransform(() => 1 + (1 / scaleX.get() - 1) * unscale.get())
  const contentScaleY = useTransform(() => 1 + (1 / scaleY.get() - 1) * unscale.get())

  const glider = useRef<Glider | null>(null)
  useLayoutEffect(() => {
    const el = elRef.current
    if (!gliders || !el || !present) return
    const g: Glider = { el, x, y, scaleX, scaleY, content, unscale, carry: null }
    glider.current = g
    gliders.set(panel.id, g)
    return () => { gliders.delete(panel.id) }
  }, [gliders, panel.id, present, x, y, scaleX, scaleY, content, unscale])

  /**
   * A gesture during a glide stops it: the card takes its own size at once.
   * A drag carries on from where the glide has the panel (see `carry`); a
   * resize works from the panel's laid-out box, so the glide jumps to its end.
   */
  const settle = useCallback((carry: boolean) => {
    for (const v of [x, y, scaleX, scaleY, content]) v.stop()
    scaleX.jump(1)
    scaleY.jump(1)
    content.jump(1)
    unscale.jump(1)
    const offset = { x: x.get(), y: y.get() }
    if (carry && glider.current && (offset.x !== 0 || offset.y !== 0)) {
      glider.current.carry = offset
      return
    }
    x.jump(0)
    y.jump(0)
  }, [x, y, scaleX, scaleY, content, unscale])

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

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      settle(true)
      beginGesture(panel.id)
      board.api.move.pointerdown(e.nativeEvent, panel.id, e.currentTarget as HTMLElement)
    },
    [board, panel.id, beginGesture, settle],
  )
  const onHandleGestureStart = useCallback(() => {
    settle(false)
    beginGesture(panel.id)
  }, [panel.id, beginGesture, settle])

  const icon = panel.lensType ? getIcon?.(panel.lensType) : undefined
  const label = panelLabel(panel, getLabel)
  const movable = present && !isFullscreen && !stacked

  const motionTiming = reducedMotion
    ? { duration: 0 }
    : { type: 'tween' as const, duration: MOTION_MS / 1000, ease: MOTION_EASE_BEZIER }
  // Arrives from, and leaves to, the shared starting look (a slide would take
  // the glide's `y`, so the scale from its top edge does the travelling).
  const away = { opacity: ENTER_FROM.opacity, scale: ENTER_FROM.scale }

  const data = {
    'data-testid': present ? `panel-${panel.id}` : undefined,
    'data-panel-id': present ? panel.id : undefined,
    'data-leaving': present ? undefined : '',
    'data-stack-order': stacked ? stackOrder : undefined,
    // Where the panel is headed, not where a transition has it now (see reveal.ts).
    'data-layout-top': stacked ? undefined : panel.pos_y,
    'data-layout-height': stacked ? undefined : panel.height,
  } as Record<string, unknown>
  return usePart(board, 'panel', { value: panel.id, stacked }, {
    ...data,
    ref: elRef,
    className: 'rounded-widget border border-border-subtle',
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
        : present
          ? { zIndex }
          // Gone from the board, so the board no longer places it: drawn where it was for its exit.
          : { position: 'absolute', left: panel.pos_x, top: panel.pos_y, width: panel.width, height: panel.height, zIndex }),
      backgroundColor: 'var(--color-surface-raised)',
      boxShadow: dragging
        ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 50%, transparent)'
        : isSelected
          ? 'var(--shadow-panel-focused), inset 0 0 0 2px color-mix(in oklab, var(--color-accent) 70%, transparent)'
          : (isFocused || isHovered)
            ? 'var(--shadow-panel-focused)'
            : 'var(--shadow-panel)',
      // Only the shadow eases in CSS: where the panel is and how it fades are
      // motion/react's (arrive, leave, dim, glide), never a CSS transition, so
      // the two never fight over a value. The box follows the pointer with no
      // easing while dragged (so it doesn't lag); switching layouts snaps too.
      transition: dragging || stacked || reducedMotion ? undefined : 'box-shadow var(--transition-panel)',
      transformOrigin: PANEL_ORIGIN,
      // Nothing to press while it steps back behind a fullscreen panel.
      pointerEvents: isBehind ? 'none' : undefined,
    }),
    // motion/react draws the card (arrive, leave, dim, step back, lift, glide);
    // UI SDK places it and moves it.
    render: (props: Record<string, unknown>, state: { dragging: boolean }) => (
      <motion.div
        {...props}
        // Nothing to reach while it leaves, or while it steps back behind a fullscreen panel.
        inert={!present || isBehind || undefined}
        aria-hidden={present ? undefined : true}
        style={{ ...(props.style as React.CSSProperties), x, y, scaleX, scaleY }}
        initial={reducedMotion ? false : away}
        animate={{
          opacity: isBehind ? 0 : isDimmed ? 0.3 : 1,
          // Lifted while dragged.
          scale: state.dragging ? 1.015 : isBehind ? ENTER_FROM.scale : 1,
        }}
        exit={reducedMotion ? undefined : away}
        transition={motionTiming}
      />
    ),
    children: (
      // Clips the content to the card while the card glides (see `glide`).
      <div className="h-full w-full overflow-hidden rounded-widget">
        <motion.div className="h-full w-full" style={{ opacity: content, scaleX: contentScaleX, scaleY: contentScaleY, transformOrigin: PANEL_ORIGIN }}>
          <PanelChrome
            panelId={panel.id}
            title={label}
            icon={icon}
            onClose={handleClose}
            onDragHandlePointerDown={movable ? onHeaderPointerDown : undefined}
            isFullscreen={isFullscreen}
            onToggleFullscreen={stacked ? undefined : handleToggleFullscreen}
            headerActions={renderHeaderActions?.(panel.id)}
            // After the header in tab order (the handles sit on the panel's edge,
            // positioned against the panel, so where they are in the DOM doesn't move them).
            afterHeader={movable && (
              <div
                style={{ pointerEvents: isHovered ? 'auto' : 'none' }}
                data-testid={`resize-handles-${panel.id}`}
              >
                {ALL_DIRECTIONS.map((dir) => (
                  <ResizeHandle key={dir} board={board} direction={dir} panelId={panel.id} title={label} tabStop={!!isSelected} onGestureStart={onHandleGestureStart} />
                ))}
              </div>
            )}
          >
            {lastContent.current}
          </PanelChrome>
        </motion.div>
      </div>
    ),
  }, 'div')
}
