import {
  createChange,
  createReorder,
  definePrimitive,
  type ChangeDetails,
  type ReorderDraft,
  type ReorderMessage,
  type ReorderReason,
} from '@ui-sdk/core'

export type SortableOptions = {
  /** Item keys in their committed order. Controlled: pass the new order back from `onValueChange`. */
  value?: string[]
  /** Called once per commit (a drop), never while an item is held. */
  onValueChange?: (value: string[], details: ChangeDetails<ReorderReason>) => void
  /** Which arrows move a picked-up item. Defaults to `vertical`. */
  orientation?: 'horizontal' | 'vertical'
  /** What a screen reader calls an item, e.g. "Maths board". Defaults to the item's text. */
  label?: (key: string) => string | undefined
}

/** Our wording for each step a screen reader hears while an item is reordered. */
export function sortableMessage({ type, label, position, total }: ReorderMessage): string {
  const at = `position ${position} of ${total}`
  if (type === 'grab') return `Picked up ${label}, ${at}.`
  if (type === 'move') return `${label} moved to ${at}`
  if (type === 'drop') return `${label} dropped at ${at}`
  return `Move cancelled. ${label} is back at ${at}`
}

/** What each handle is described by, for the orientation in use. */
export function sortableInstructions(orientation: 'horizontal' | 'vertical'): string {
  const arrows = orientation === 'horizontal' ? 'Left and right' : 'Up and down'
  return `Press Space to pick up. ${arrows} arrows move it. Space or Enter drops it. Escape cancels.`
}

/**
 * Reorder a list by pointer or keyboard, on UI SDK `createReorder`. Each
 * `item` holds a place in the order; a `handle` inside it (a grip, or the
 * item's own button) takes the press and the keys. Callers use `Sortable`,
 * `SortableItem` and `SortableHandle`, never this definition.
 */
export const sortable = definePrimitive({
  name: 'sortable',
  options: { value: 'value', onValueChange: 'callback', orientation: 'string', label: 'action' },
  controlled: ['value'],
  state: (options: SortableOptions) => ({
    value: options.value ?? ([] as string[]),
    moving: null as ReorderDraft | null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    const reorder = createReorder(context, {
      slot: 'item',
      key: 'value',
      draft: 'moving',
      orientation: () => context.options().orientation ?? 'vertical',
      set: (value, details) => change('value', value, details),
      label: (key) => context.options().label?.(key),
      message: sortableMessage,
    })
    return { reorder }
  },
  slots: (slot) => ({
    root: slot<{}, { order: string[] }>({
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
    }),
    item: slot<{ value: string }>({
      props: { value: 'string' },
      attrs: (state, part) => ({
        'data-moving': part.api.reorder.moving(state, part.key) ? '' : undefined,
        'data-dragging': part.api.reorder.dragging(state, part.key) ? '' : undefined,
      }),
      bind: (el, part) => part.api.reorder.bind(el, part),
    }),
    handle: slot<{ value: string; enterActivates: boolean }>({
      props: {
        value: { kind: 'string', from: 'item', required: true },
        enterActivates: 'boolean',
      },
      attrs: (_state, part) => ({
        'aria-roledescription': 'sortable item',
        'aria-describedby': `${part.id}-instructions`,
      }),
      on: {
        keydown: (event, { api, props, store }) => {
          // A handle that is also a button (a tab) keeps Enter to activate it,
          // until it is picked up, when Enter drops like Space.
          if (props.enterActivates && event.key === 'Enter' && !store.get().moving) return
          api.reorder.keydown(event, props.value)
        },
        pointerdown: (event, { api, props }) => api.reorder.pointerdown(event, props.value),
      },
    }),
    instructions: slot({
      attrs: (_state, part) => ({ id: `${part.id}-instructions` }),
    }),
  }),
})
