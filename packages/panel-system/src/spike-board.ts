// SPIKE (K0 spike 3, throwaway, never merged): board panels on UI SDK's
// createMove (header drag, Alt+arrows) and createResize (8 handles, arrows).
import {
  createMove,
  createResize,
  definePrimitive,
  live,
  type MoveDraft,
  type MovePoint,
  type ResizeBox,
  type ResizeDraft,
  type ResizeHandle,
} from '@ui-sdk/core'

export type BoardCommit = { boxes: Record<string, ResizeBox>; reason: string }

export type BoardOptions = {
  boxes?: Record<string, ResizeBox>
  /** Called once per committed drop or key press, never per pointer move. */
  onCommit?: (commit: BoardCommit) => void
  /** Grid a drop lands on and the keyboard step. */
  step?: () => number
  largeStep?: () => number
  canvas?: () => { width: number; height: number } | undefined
  isDisabled?: (key: string) => boolean
  min?: (key: string) => { width: number; height: number }
  max?: (key: string) => { width: number; height: number } | undefined
  label?: (key: string) => string | undefined
}

type State = {
  boxes: Record<string, ResizeBox>
  positions: Record<string, MovePoint>
  moving: MoveDraft | null
  resizing: ResizeDraft | null
}

const toPositions = (boxes: Record<string, ResizeBox>) =>
  Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, { x: b.x, y: b.y }]))

export const board = definePrimitive({
  name: 'board',
  options: {
    boxes: 'value',
    onCommit: 'callback',
    step: 'value',
    largeStep: 'value',
    canvas: 'value',
    isDisabled: 'value',
    min: 'value',
    max: 'value',
    label: 'value',
  },
  live: ['moving', 'resizing'],
  state: (options: BoardOptions): State => ({
    boxes: options.boxes ?? {},
    positions: toPositions(options.boxes ?? {}),
    moving: null,
    resizing: null,
  }),
  sync: (options) => (options.boxes ? { boxes: options.boxes, positions: toPositions(options.boxes) } : {}),
  api: (context) => {
    const commit = (boxes: Record<string, ResizeBox>, reason: string) => {
      context.store.set({ boxes, positions: toPositions(boxes) })
      context.options().onCommit?.({ boxes, reason })
      return true
    }
    const disabled = (key: string) => context.options().isDisabled?.(key) ?? false
    const step = () => context.options().step?.() ?? 1
    const largeStep = () => context.options().largeStep?.() ?? step() * 10
    const label = (key: string) => context.options().label?.(key)

    const move = createMove(context, {
      key: 'positions',
      draft: 'moving',
      set: (positions, details) => {
        const boxes = { ...context.store.get().boxes }
        for (const [k, p] of Object.entries(positions)) boxes[k] = { ...boxes[k]!, x: p.x, y: p.y }
        return commit(boxes, details.reason)
      },
      step,
      largeStep,
      // Today's clampToCanvas: keep min(100, w/2, h/2) px of the panel on the canvas.
      bounds: (key) => {
        const b = context.store.get().boxes[key]
        const canvas = context.options().canvas?.()
        if (!b || !canvas) return undefined
        const visible = Math.min(100, b.width / 2, b.height / 2)
        return { minX: visible - b.width, minY: 0, maxX: canvas.width - visible, maxY: canvas.height - visible }
      },
      disabled,
      label,
    })

    const resize = createResize(context, {
      boxes: (state) => state.boxes,
      draft: 'resizing',
      set: (boxes, details) => commit(boxes, details.reason),
      step,
      largeStep,
      min: (key) => context.options().min?.(key) ?? { width: 200, height: 150 },
      max: (key) => context.options().max?.(key),
      // Today resizing has no canvas bounds; the board grows downward.
      bounds: () => {
        const canvas = context.options().canvas?.()
        return canvas ? { left: 0, top: 0, right: canvas.width, bottom: Infinity } : undefined
      },
      disabled,
      label,
    })

    return { move, resize }
  },
  slots: (slot) => ({
    root: slot({}),
    panel: slot<{ value: string; stacked: boolean }, { dragging: boolean }>({
      props: { value: 'string', stacked: 'boolean' },
      state: (state, { key, api }) => ({
        dragging: api.move.dragging(state, key) || api.resize.dragging(state, key) !== undefined,
      }),
      attrs: (state, { key, props, api }) => (props.stacked ? {} : { style: api.resize.boxStyle(state, key) }),
      live: live((state, { key, props, api }) => {
        if (props.stacked) return {}
        const style = [api.move.style(state, key), api.resize.style(state, key)].filter(Boolean).join(';')
        return { style: style || undefined }
      }),
    }),
    handle: slot<{ id: string; box: string; handle: ResizeHandle }>({
      props: { id: 'string', box: 'string', handle: 'string' },
      attrs: (_state, { props, api }) => api.resize.handleAttrs(props.handle),
      on: {
        pointerdown: (event, { el, api, props }) => api.resize.pointerdown(event as PointerEvent, props.box, props.handle, el!),
        keydown: (event, { api, props }) => {
          api.resize.keydown(event as KeyboardEvent, props.box, props.handle)
        },
      },
    }),
  }),
})
