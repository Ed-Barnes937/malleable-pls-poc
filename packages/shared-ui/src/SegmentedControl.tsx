import {
  SegmentedControl as SdkSegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from '@ui-sdk/react/segmented-control'
import { cn } from './utils'

export interface SegmentedOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SegmentedControlProps {
  options: SegmentedOption[]
  /** Accessible name for the group. */
  label: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Pick one of a few options from a row, on UI SDK SegmentedControl: one tab
 * stop, arrow keys move and choose, a sliding indicator marks the choice.
 */
export function SegmentedControl({
  options,
  label,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
}: SegmentedControlProps) {
  return (
    <SdkSegmentedControl
      aria-label={label}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange ? (next) => { if (next !== null) onValueChange(next) } : undefined}
      disabled={disabled}
      className={cn(
        'relative isolate inline-flex w-fit rounded-track bg-surface-overlay p-0.5 data-disabled:opacity-50',
        className,
      )}
    >
      <SegmentedControlIndicator className="absolute -z-10 rounded-tab bg-surface-raised shadow-panel transition-[top,left,width,height] duration-200 data-[activation-direction=none]:transition-none motion-reduce:transition-none [top:var(--segmented-control-indicator-top)] [left:var(--segmented-control-indicator-left)] [width:var(--segmented-control-indicator-width)] [height:var(--segmented-control-indicator-height)]" />
      {options.map((option) => (
        <SegmentedControlItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-tab px-3 text-body text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent data-checked:text-text-primary data-disabled:cursor-not-allowed data-disabled:opacity-50"
        >
          {option.label}
        </SegmentedControlItem>
      ))}
    </SdkSegmentedControl>
  )
}
