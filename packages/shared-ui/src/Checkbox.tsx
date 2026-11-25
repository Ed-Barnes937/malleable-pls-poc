import type { ReactNode } from 'react'
import { Checkbox as SdkCheckbox, CheckboxIndicator } from '@ui-sdk/react/checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from './utils'

export interface CheckboxProps {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  /** Accessible name when there is no visible text. */
  label?: string
  /** Visible text; the whole row is the press target. */
  children?: ReactNode
  className?: string
}

/** A tick box on UI SDK Checkbox: Space toggles, the label is part of the target. */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  children,
  className,
}: CheckboxProps) {
  const box = (
    <SdkCheckbox
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next === true)}
      disabled={disabled}
      aria-label={children ? undefined : label}
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-item border border-border bg-surface-raised text-accent-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent data-checked:bg-accent data-indeterminate:border-accent data-indeterminate:bg-accent data-disabled:cursor-not-allowed data-disabled:opacity-50',
        children ? undefined : className,
      )}
    >
      <CheckboxIndicator>
        {(state) => (state.indeterminate ? <Minus aria-hidden="true" className="h-3.5 w-3.5" /> : <Check aria-hidden="true" className="h-3.5 w-3.5" />)}
      </CheckboxIndicator>
    </SdkCheckbox>
  )
  if (!children) return box
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-body text-text-primary has-data-disabled:cursor-not-allowed has-data-disabled:opacity-70', className)}>
      {box}
      {children}
    </label>
  )
}
