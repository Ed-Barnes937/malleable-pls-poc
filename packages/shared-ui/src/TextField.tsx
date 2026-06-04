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
        'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-700 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20',
        className,
      )}
      {...rest}
    />
  )
})
