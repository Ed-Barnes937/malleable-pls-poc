import { type ComponentProps } from 'react'
import {
  PopoverContent as UiPopoverContent,
  PopoverDescription as UiPopoverDescription,
  PopoverTitle as UiPopoverTitle,
} from '@ui-sdk/react/popover'
import { cn } from './utils'

export {
  Popover,
  PopoverClose,
  PopoverTrigger,
  createPopoverController,
  type PopoverProps,
  type PopoverController,
} from '@ui-sdk/react/popover'

/** The popover box (also the look of Menu): our raised surface, on the top layer. */
export const POPOVER_SURFACE_CLASS =
  'm-0 max-h-(--available-height) overflow-y-auto rounded-widget border border-border-subtle bg-surface-raised text-body text-text-primary shadow-pop outline-none origin-(--transform-origin) transition-[opacity,scale] duration-150 data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 motion-reduce:transition-none'

export type PopoverContentProps = Omit<ComponentProps<typeof UiPopoverContent>, 'className'> & { className?: string }

/** A UI SDK Popover's content, styled from our tokens, 8px from its anchor and kept 8px inside the window. */
export function PopoverContent({ className, sideOffset = 8, collisionPadding = 8, ...props }: PopoverContentProps) {
  return (
    <UiPopoverContent
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(POPOVER_SURFACE_CLASS, 'flex max-w-80 flex-col gap-2 p-4', className)}
      {...props}
    />
  )
}

export function PopoverTitle({ className, ...props }: Omit<ComponentProps<typeof UiPopoverTitle>, 'className'> & { className?: string }) {
  return <UiPopoverTitle className={cn('text-body font-semibold text-text-primary', className)} {...props} />
}

export function PopoverDescription({ className, ...props }: Omit<ComponentProps<typeof UiPopoverDescription>, 'className'> & { className?: string }) {
  return <UiPopoverDescription className={cn('text-meta text-text-secondary', className)} {...props} />
}
