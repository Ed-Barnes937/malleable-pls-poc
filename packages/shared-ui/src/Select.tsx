import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './utils'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Class applied to the relative wrapper div (the select itself takes `className`). */
  wrapperClassName?: string
}

/**
 * Styled native select with the chevron affordance baked in. The wrapper is
 * `relative` so the chevron can be absolutely positioned over the field.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          'h-10 w-full cursor-pointer appearance-none rounded-control border border-border bg-surface-raised px-3 pr-8 text-body text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
    </div>
  )
})
