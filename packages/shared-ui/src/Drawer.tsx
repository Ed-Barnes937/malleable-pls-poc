import { useState, type ComponentProps } from 'react'
import {
  Drawer as UiDrawer,
  DrawerBackdrop as UiDrawerBackdrop,
  DrawerContent as UiDrawerContent,
  DrawerTitle as UiDrawerTitle,
} from '@ui-sdk/react/drawer'
import type { DrawerProps } from '@ui-sdk/react/drawer'
import { cn } from './utils'

export type { DrawerProps }

export {
  DrawerClose,
  DrawerDescription,
  DrawerTrigger,
  createDrawerController,
  type DrawerController,
} from '@ui-sdk/react/drawer'

/**
 * UI SDK's Drawer, made modal only while open. A modal drawer keeps the page
 * inert until its slide-out ends, which would swallow a press on the page right
 * after closing; once closing starts the page is live again while the sheet
 * still slides out.
 */
export function Drawer({ modal, onOpenChange, ...props }: DrawerProps) {
  const [open, setOpen] = useState(props.open ?? props.defaultOpen ?? false)
  return (
    <UiDrawer
      {...props}
      modal={modal ?? (props.open ?? open)}
      onOpenChange={(next, details) => {
        onOpenChange?.(next, details)
        if (!details.canceled) setOpen(next)
      }}
    />
  )
}

type Styled<T> = Omit<T, 'className'> & { className?: string }

/**
 * A UI SDK Drawer's sheet and the dimmed page behind it, styled from our
 * tokens for each edge (`side` on `Drawer`: left and right are 320px panels,
 * bottom is a sheet). UI SDK slides it and owns its translate and the
 * backdrop's opacity; it can be swiped back to its edge. Slides in and slides
 * out on close. UI SDK keeps a closing layer mounted until its exit animation
 * ends, so both parts ignore presses once closed (`data-closed`): a quick press
 * on the page right after closing reaches the page, not the fading backdrop.
 */
export function DrawerContent({ className, onPointerDown, ...props }: Styled<ComponentProps<typeof UiDrawerContent>>) {
  return (
    <>
      <UiDrawerBackdrop className="fixed inset-0 bg-scrim-light data-closed:pointer-events-none" />
      <UiDrawerContent
        onPointerDown={(e) => {
          onPointerDown?.(e)
          e.stopPropagation()
        }}
        className={cn(
          'relative flex flex-col bg-surface-raised text-body text-text-primary shadow-pop outline-none data-closed:pointer-events-none',
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
