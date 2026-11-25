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

/** The grid every move and resize lands on, and how far a key moves a panel or an edge. */
export const GRID_SIZE = 20

export type PanelBoardCommit = {
  /** Every panel's box after the change. */
  boxes: Record<string, ResizeBox>
  /** `drag` for a pointer drop, `move-key` / `resize-key` for a key press. */
  reason: MoveReason | ResizeReason
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

/** The preview box as custom properties, which the panel's `boxStyle` reads first. */
const boxVars = (box: ResizeBox) =>
  `--resize-x:${box.x}px;--resize-y:${box.y}px;--resize-width:${box.width}px;--resize-height:${box.height}px`

/**
 * The board's panels on UI SDK's `createMove` (header drag, Alt+arrows) and
 * `createResize` (8 handles, arrows on a focused handle). Both snap to
 * `GRID_SIZE`; Shift on a resize corner keeps the panel's shape.
 *
 * UI SDK only snaps and bounds a drag when it is dropped, so the panel's own
 * `live` binding shows the drag already snapped and kept on the canvas: what
 * the drop will commit, never a box that jumps on release.
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
    const commit = (boxes: Record<string, ResizeBox>, reason: PanelBoardCommit['reason']) => {
      context.store.set({ boxes, positions: positionsOf(boxes) })
      context.options().onCommit?.({ boxes, reason })
      return true
    }
    const disabled = (key: string) => context.options().disabled?.(key) ?? false
    const label = (key: string) => context.options().label?.(key)
    const step = () => GRID_SIZE

    /** Today's rule: keep min(100, w/2, h/2) px of the panel on the canvas, and its top edge on it. */
    const bounds = (key: string) => {
      const box = context.store.get().boxes[key]
      const canvas = context.options().canvas?.()
      if (!box || !canvas?.width || !canvas.height) return undefined
      return canvasBounds(box, canvas)
    }

    /** Where a move lands: on the grid, then inside `bounds`, as `createMove` commits it. */
    const place = (key: string, x: number, y: number): MovePoint => {
      const b = bounds(key)
      const point = { x: onGrid(x), y: onGrid(y) }
      return b
        ? { x: Math.min(b.maxX, Math.max(b.minX, point.x)), y: Math.min(b.maxY, Math.max(b.minY, point.y)) }
        : point
    }

    const move = createMove(context, {
      key: 'positions',
      draft: 'moving',
      set: (positions, details) => {
        const boxes = { ...context.store.get().boxes }
        for (const [key, p] of Object.entries(positions)) boxes[key] = { ...boxes[key]!, x: p.x, y: p.y }
        return commit(boxes, details.reason)
      },
      step,
      bounds,
      disabled,
      label,
    })

    const resize = createResize(context, {
      boxes: (state) => state.boxes,
      draft: 'resizing',
      set: (boxes, details) => commit(boxes, details.reason),
      step,
      min: (key) => context.options().min?.(key) ?? { width: 1, height: 1 },
      max: (key) => context.options().max?.(key),
      // The top edge stays on the canvas, as a move keeps it; the board grows downward.
      bounds: () => ({ left: -Infinity, top: 0, right: Infinity, bottom: Infinity }),
      disabled,
      label,
    })

    return {
      move,
      resize,
      /** The box a pointer drag will drop the panel at, or undefined when it isn't being dragged. */
      preview(state: State, key: string): ResizeBox | undefined {
        const box = state.boxes[key]
        if (!box) return undefined
        if (state.moving?.keys.includes(key)) {
          return { ...box, ...place(key, box.x + state.moving.dx, box.y + state.moving.dy) }
        }
        if (state.resizing?.key === key) {
          const b = state.resizing.box
          // createResize rounds each side to the grid on release.
          return { x: onGrid(b.x), y: onGrid(b.y), width: onGrid(b.width), height: onGrid(b.height) }
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
