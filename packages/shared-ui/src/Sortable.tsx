import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { createParts } from '@ui-sdk/react/primitive'
import { cn } from './utils'
import { sortable, sortableInstructions } from './sortable-primitive'

const parts = createParts(sortable, {
  root: 'div',
  item: 'div',
  handle: 'button',
  instructions: 'span',
})

type RootProps = ComponentProps<typeof parts.Root>

export type SortableProps = Omit<RootProps, 'children' | 'role'> & {
  /** Accessible name of the list, e.g. "Boards". */
  'aria-label': string
  /** Render the items in `order`, which follows the item while it is held. */
  children: (state: { order: string[] }) => ReactNode
}

/**
 * Reorder items by dragging or with the keyboard (Space picks up, arrows move,
 * Space or Enter drops, Escape cancels), on UI SDK `createReorder`. Render the
 * items from `order`, each a `SortableItem` with a `SortableHandle`.
 * `onValueChange` fires once per drop with the whole new order.
 */
export function Sortable({ children, orientation = 'vertical', ...rest }: SortableProps) {
  return (
    <parts.Root role="group" orientation={orientation} {...rest}>
      {(state: { order: string[] }) => (
        <>
          {children(state)}
          <parts.Instructions className="sr-only">{sortableInstructions(orientation)}</parts.Instructions>
        </>
      )}
    </parts.Root>
  )
}

/** One place in the order. While it is held it lifts (`data-moving`) and, under a pointer, follows it (`data-dragging`). */
export function SortableItem({ className, ...rest }: ComponentProps<typeof parts.Item>) {
  return (
    <parts.Item
      className={cn(
        'data-dragging:relative data-dragging:z-10 data-dragging:transition-none data-dragging:[transform:translate(var(--drag-x,0px),var(--drag-y,0px))]',
        'data-moving:opacity-60',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * What takes the press and keys for its `SortableItem`: a grip button, or the
 * item's own button. `enterActivates` keeps Enter for the button's own action
 * until the item is picked up with Space.
 */
export function SortableHandle({
  className,
  ...rest
}: Omit<ComponentProps<typeof parts.Handle>, 'value' | 'enterActivates'> & {
  /** The item's key. Defaults to the enclosing `SortableItem`'s. */
  value?: string
  enterActivates?: boolean
}) {
  const Handle = parts.Handle as ComponentType<Record<string, unknown>>
  return <Handle type="button" className={cn('select-none', className)} {...rest} />
}
