import { type ComponentProps } from 'react'
import {
  DrawerBackdrop as UiDrawerBackdrop,
  DrawerContent as UiDrawerContent,
  DrawerTitle as UiDrawerTitle,
} from '@ui-sdk/react/drawer'
import { cn } from './utils'

export {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerTrigger,
  createDrawerController,
  type DrawerProps,
  type DrawerController,
} from '@ui-sdk/react/drawer'

type Styled<T> = Omit<T, 'className'> & { className?: string }

/**
 * A UI SDK Drawer's sheet and the dimmed page behind it, styled from our
 * tokens for each edge (`side` on `Drawer`: left and right are 320px panels,
 * bottom is a sheet). UI SDK slides it and owns its translate and the
 * backdrop's opacity; it can be swiped back to its edge.
 */
export function DrawerContent({ className, ...props }: Styled<ComponentProps<typeof UiDrawerContent>>) {
  return (
    <>
      <UiDrawerBackdrop className="fixed inset-0 bg-scrim-light" />
      <UiDrawerContent
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'relative flex flex-col bg-surface-raised text-body text-text-primary shadow-pop outline-none',
          'data-[side=left]:h-full data-[side=left]:w-80 data-[side=left]:max-w-[calc(100vw-48px)] data-[side=left]:rounded-r-widget',
          'data-[side=right]:h-full data-[side=right]:w-80 data-[side=right]:max-w-[calc(100vw-48px)] data-[side=right]:rounded-l-widget',
          'data-[side=bottom]:max-h-[85dvh] data-[side=bottom]:w-full data-[side=bottom]:rounded-t-widget',
          'data-[side=top]:max-h-[85dvh] data-[side=top]:w-full data-[side=top]:rounded-b-widget',
          className,
        )}
        {...props}
      />
    </>
  )
}

export function DrawerTitle({ className, ...props }: Styled<ComponentProps<typeof UiDrawerTitle>>) {
  return <UiDrawerTitle className={cn('text-title font-semibold text-text-primary', className)} {...props} />
}
