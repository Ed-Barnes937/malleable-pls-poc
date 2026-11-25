import { type ComponentProps, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  MenuContent as UiMenuContent,
  MenuGroupLabel as UiMenuGroupLabel,
  MenuItem as UiMenuItem,
  MenuItemIndicator as UiMenuItemIndicator,
  MenuRadioItem as UiMenuRadioItem,
  MenuSeparator as UiMenuSeparator,
} from '@ui-sdk/react/menu'
import { POPOVER_SURFACE_CLASS } from './Popover'
import { cn } from './utils'

export {
  Menu,
  MenuGroup,
  MenuRadioGroup,
  MenuTrigger,
  createMenuController,
  type MenuProps,
  type MenuController,
} from '@ui-sdk/react/menu'

type Styled<T> = Omit<T, 'className'> & { className?: string }

/** A UI SDK Menu's list, styled like our popovers. Arrow keys, typeahead, Escape and focus return come from UI SDK. */
export function MenuContent({ className, sideOffset = 6, collisionPadding = 8, ...props }: Styled<ComponentProps<typeof UiMenuContent>>) {
  return (
    <UiMenuContent
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(POPOVER_SURFACE_CLASS, 'min-w-44 rounded-control p-1', className)}
      {...props}
    />
  )
}

/** A menu row. `destructive` colours it as dangerous (e.g. Delete). */
export function MenuItem({ className, ...props }: Styled<ComponentProps<typeof UiMenuItem>>) {
  return (
    <UiMenuItem
      className={cn(
        'flex min-h-8 cursor-default select-none items-center gap-2.5 rounded-item px-2.5 py-1.5 text-body text-text-secondary outline-none data-highlighted:bg-surface-overlay data-highlighted:text-text-primary data-disabled:opacity-40 data-destructive:text-confused data-highlighted:data-destructive:text-confused',
        className,
      )}
      {...props}
    />
  )
}

/**
 * One choice in a `MenuRadioGroup`: the checked one has a check mark and is
 * announced as checked. Closes the menu when picked (UI SDK's radio items stay
 * open by default; a one-of-three setting is done once chosen).
 */
export function MenuRadioItem({ className, children, closeOnSelect = true, ...props }: Omit<Styled<ComponentProps<typeof UiMenuRadioItem>>, 'children'> & { children?: ReactNode }) {
  return (
    <UiMenuRadioItem
      closeOnSelect={closeOnSelect}
      className={cn(
        'flex min-h-8 cursor-default select-none items-center gap-2.5 rounded-item px-2.5 py-1.5 text-body text-text-secondary outline-none data-highlighted:bg-surface-overlay data-highlighted:text-text-primary data-disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
        <UiMenuItemIndicator><Check className="h-4 w-4" /></UiMenuItemIndicator>
      </span>
      {children}
    </UiMenuRadioItem>
  )
}

export function MenuSeparator({ className, ...props }: Styled<ComponentProps<typeof UiMenuSeparator>>) {
  return <UiMenuSeparator className={cn('-mx-1 my-1 h-px bg-border-subtle', className)} {...props} />
}

export function MenuGroupLabel({ className, ...props }: Styled<ComponentProps<typeof UiMenuGroupLabel>>) {
  return <UiMenuGroupLabel className={cn('px-2.5 pt-2 pb-1 text-meta font-semibold text-text-muted', className)} {...props} />
}
