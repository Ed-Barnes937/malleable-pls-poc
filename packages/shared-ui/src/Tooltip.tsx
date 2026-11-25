import { type ComponentProps } from 'react'
import { TooltipContent as UiTooltipContent } from '@ui-sdk/react/tooltip'
import { cn } from './utils'

export { Tooltip, TooltipTrigger, type TooltipProps } from '@ui-sdk/react/tooltip'

/** A short hint on hover and keyboard focus, in our inverse colours. Plain text only: it can't be focused. */
export function TooltipContent({ className, sideOffset = 6, collisionPadding = 8, ...props }: Omit<ComponentProps<typeof UiTooltipContent>, 'className'> & { className?: string }) {
  return (
    <UiTooltipContent
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'm-0 max-w-64 rounded-item bg-inverse px-2 py-1 text-meta font-medium text-inverse-foreground shadow-pop transition-opacity duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  )
}
