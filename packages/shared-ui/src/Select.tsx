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
          'w-full cursor-pointer appearance-none rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 pr-7 text-xs text-neutral-300 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
    </div>
  )
})
