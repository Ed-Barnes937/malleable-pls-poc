import {
  createMove,
  createResize,
  definePrimitive,
  live,
  prepareAnnouncements,
  type MoveDraft,
  type MovePoint,
  type MoveReason,
  type ResizeBox,
  type ResizeDraft,
  type ResizeHandle,
  type ResizeReason,
} from '@ui-sdk/core'
import { canvasBounds } from './geometry'

/** The grid a key press and a Shift drag land on, and how far a key moves a panel or an edge. */
export const GRID_SIZE = 20

export type PanelBoardCommit = {
  /** Every panel's box after the change. */
  boxes: Record<string, ResizeBox>
  /** `drag` for a pointer drop, `move-key` / `resize-key` for a key press. */
  reason: MoveReason | ResizeReason
  /** A pointer drop that snapped (Shift held as the button came up). */
  snapped: boolean
}

export type PanelBoardOptions = {
  /** The saved layout, by panel id. */
  boxes?: Record<string, ResizeBox>
  /** Runs once per committed drop or key press, never per pointer move, and not for a drag Escape put back. */
  onCommit?: (commit: PanelBoardCommit) => void
  /** The canvas a panel is kept on while it moves; undefined (or unmeasured) leaves it free. */
  canvas?: () => { width: number; height: number } | undefined
  /** Whether a panel can't be moved or resized (stacked layout, fullscreen). */
  disabled?: (key: string) => boolean
  min?: (key: string) => { width: number; height: number }
  max?: (key: string) => { width: number; height: number } | undefined
  /** What screen readers call a panel in the move and resize announcements. */
  label?: (key: string) => string | undefined
  /** Whether Shift is held: a pointer drag then snaps (see `snapBox`). */
  shift?: () => boolean
  /**
   * Where a snapping drag puts the panel whose free box is `box`, by `handle`
   * (`move` for a header drag). Defaults to the box on the grid.
   */
  snapBox?: (key: string, box: ResizeBox, handle: ResizeHandle) => ResizeBox
}

type State = {
  boxes: Record<string, ResizeBox>
  positions: Record<string, MovePoint>
  moving: MoveDraft | null
  resizing: ResizeDraft | null
}

const positionsOf = (boxes: Record<string, ResizeBox>) =>
  Object.fromEntries(Object.entries(boxes).map(([key, b]) => [key, { x: b.x, y: b.y }]))

const onGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE

/** A box on whole pixels, as UI SDK lands a free drop. */
const whole = (box: ResizeBox): ResizeBox =>
  ({ x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) })

/** The preview box as custom properties, which the panel's `boxStyle` reads first. */
const boxVars = (box: ResizeBox) =>
  `--resize-x:${box.x}px;--resize-y:${box.y}px;--resize-width:${box.width}px;--resize-height:${box.height}px`

/**
 * The board's panels on UI SDK's `createMove` (header drag, Alt+arrows) and
 * `createResize` (8 handles, arrows on a focused handle). A pointer drag is
 * free; with Shift held it snaps (`snapBox`). A key press steps `GRID_SIZE`.
 * Shift on a resize corner keeps no shape: it snaps, as on an edge.
 *
 * UI SDK only bounds a drag when it is dropped, so the panel's own `live`
 * binding shows the drag already kept on the canvas (and snapped, with
 * Shift): what the drop will commit, never a box that jumps on release.
 */
export const panelBoard = definePrimitive({
  name: 'panel-board',
  options: {
    boxes: 'value',
    onCommit: 'callback',
    canvas: 'value',
    disabled: 'value',
    min: 'value',
    max: 'value',
    label: 'value',
    shift: 'value',
    snapBox: 'value',
  },
  live: ['moving', 'resizing'],
  state: (options: PanelBoardOptions): State => ({
    boxes: options.boxes ?? {},
    positions: positionsOf(options.boxes ?? {}),
    moving: null,
    resizing: null,
  }),
  sync: (options) => (options.boxes ? { boxes: options.boxes, positions: positionsOf(options.boxes) } : {}),
  api: (context) => {
    const commit = (boxes: Record<string, ResizeBox>, reason: PanelBoardCommit['reason'], snapped = false) => {
      context.store.set({ boxes, positions: positionsOf(boxes) })
      context.options().onCommit?.({ boxes, reason, snapped })
      return true
    }
    const disabled = (key: string) => context.options().disabled?.(key) ?? false
    const label = (key: string) => context.options().label?.(key)
    /** A key press steps the grid; a pointer drop lands free (whole pixels), snapped after with Shift. */
    let keying = false
    const step = () => (keying ? GRID_SIZE : 1)
    const byKey = (run: () => boolean) => {
      keying = true
      try {
        return run()
      } finally {
        keying = false
      }
    }
    const shift = () => context.options().shift?.() ?? false
    /** Whether a drop snaps: Shift as the button came up, else as last seen. */
    const snapsAt = (event?: Event) => (event && 'shiftKey' in event ? (event as MouseEvent).shiftKey : shift())
    const snap = (key: string, box: ResizeBox, handle: ResizeHandle): ResizeBox =>
      context.options().snapBox?.(key, box, handle) ?? { x: onGrid(box.x), y: onGrid(box.y), width: onGrid(box.width), height: onGrid(box.height) }
    /** The handle a pointer is resizing by, kept for the drop (UI SDK clears its draft first). */
    let resizingBy: ResizeHandle = 'se'

    /** Today's rule: keep min(100, w/2, h/2) px of the panel on the canvas, and its top edge on it. */
    const bounds = (key: string) => {
      const box = context.store.get().boxes[key]
      const canvas = context.options().canvas?.()
      if (!box || !canvas?.width || !canvas.height) return undefined
      return canvasBounds(box, canvas)
    }

    /** Where a free move lands: on whole pixels, then inside `bounds`, as `createMove` commits a drop. */
    const place = (key: string, x: number, y: number): MovePoint => {
      const b = bounds(key)
      const point = { x: Math.round(x), y: Math.round(y) }
      return b
        ? { x: Math.min(b.maxX, Math.max(b.minX, point.x)), y: Math.min(b.maxY, Math.max(b.minY, point.y)) }
        : point
    }

    const move = createMove(context, {
      key: 'positions',
      draft: 'moving',
      set: (positions, details) => {
        const was = context.store.get().boxes
        const boxes = { ...was }
        const snapped = details.reason === 'drag' && snapsAt(details.event)
        for (const [key, p] of Object.entries(positions)) {
          const box = { ...boxes[key]!, x: p.x, y: p.y }
          const moved = box.x !== was[key]?.x || box.y !== was[key]?.y
          boxes[key] = snapped && moved ? snap(key, box, 'move') : box
        }
        return commit(boxes, details.reason, snapped)
      },
      step,
      bounds,
      disabled,
      label,
    })

    const resize = createResize(context, {
      boxes: (state) => state.boxes,
      draft: 'resizing',
      set: (next, details) => {
        const snapped = details.reason === 'drag' && snapsAt(details.event)
        if (!snapped) return commit(next, details.reason, false)
        const was = context.store.get().boxes
        const boxes = { ...next }
        for (const [key, box] of Object.entries(next)) if (box !== was[key]) boxes[key] = snap(key, box, resizingBy)
        return commit(boxes, details.reason, true)
      },
      step,
      min: (key) => context.options().min?.(key) ?? { width: 1, height: 1 },
      max: (key) => context.options().max?.(key),
      // The top edge stays on the canvas, as a move keeps it; the board grows downward.
      bounds: () => ({ left: -Infinity, top: 0, right: Infinity, bottom: Infinity }),
      // Shift snaps a resize instead of keeping its shape (a ratio of 0 is none).
      aspect: () => 0,
      disabled,
      label,
    })

    return {
      move: { ...move, keydown: (event: KeyboardEvent, key: string) => byKey(() => move.keydown(event, key)) },
      resize: {
        ...resize,
        keydown: (event: KeyboardEvent, key: string, handle: ResizeHandle) => byKey(() => resize.keydown(event, key, handle)),
        pointerdown: (event: PointerEvent, key: string, handle: ResizeHandle, el: HTMLElement) => {
          resizingBy = handle
          resize.pointerdown(event, key, handle, el)
        },
      },
      /** The box a pointer drag will drop the panel at (Shift held: snapped), or undefined when it isn't being dragged. */
      preview(state: State, key: string): ResizeBox | undefined {
        const box = state.boxes[key]
        if (!box) return undefined
        if (state.moving?.keys.includes(key)) {
          const free = { ...box, ...place(key, box.x + state.moving.dx, box.y + state.moving.dy) }
          return shift() ? snap(key, free, 'move') : free
        }
        if (state.resizing?.key === key) {
          // createResize lands a drop on whole pixels.
          const free = whole(state.resizing.box)
          return shift() ? snap(key, free, state.resizing.handle) : free
        }
        return undefined
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      // Screen readers need the live regions in the page before the first move is announced.
      bind: (el) => prepareAnnouncements(el.ownerDocument),
    }),
    panel: slot<{ value: string; stacked: boolean }, { dragging: boolean }>({
      props: { value: 'string', stacked: 'boolean' },
      state: (state, { key, api }) => ({
        dragging: api.move.dragging(state, key) || api.resize.dragging(state, key) !== undefined,
      }),
      attrs: (state, { key, props, api }) => (props.stacked ? {} : { style: api.resize.boxStyle(state, key) }),
      live: live((state, { key, props, api }) => {
        const box = props.stacked ? undefined : api.preview(state, key)
        return { 'data-dragging': box ? '' : undefined, style: box ? boxVars(box) : undefined }
      }),
    }),
    handle: slot<{ id: string; box: string; handle: ResizeHandle }>({
      props: { id: 'string', box: 'string', handle: 'string' },
      attrs: (_state, { props, api }) => api.resize.handleAttrs(props.handle),
      on: {
        pointerdown: (event, { el, api, props }) =>
          api.resize.pointerdown(event as PointerEvent, props.box, props.handle, el!),
        keydown: (event, { api, props }) => {
          api.resize.keydown(event as KeyboardEvent, props.box, props.handle)
        },
      },
    }),
  }),
})
