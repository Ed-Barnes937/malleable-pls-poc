import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from './utils'

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement>

/** Styled native text input matching the shared field styling. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-control border border-border bg-surface-raised px-3 text-body text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line',
        className,
      )}
      {...rest}
    />
  )
})
